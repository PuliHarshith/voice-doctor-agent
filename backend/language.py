"""Which language the caller is speaking, and routing bot speech to a TTS that can say it.

English and Hindi go to ElevenLabs Flash v2.5 (WebSocket, ~0.35s). Telugu isn't supported by Flash, so
Telugu replies go to eleven_v3, which only works over HTTP (~1.0s to first audio, measured).
"""

import re

from loguru import logger
from pipecat.frames.frames import ManuallySwitchServiceFrame, STTUpdateSettingsFrame, TranscriptionFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.elevenlabs.stt import ElevenLabsRealtimeSTTService

SUPPORTED = ("en", "hi", "te")
_STT_CODES = {"en": "en", "eng": "en", "hi": "hi", "hin": "hi", "te": "te", "tel": "te"}
_LETTERS = re.compile(r"[^\W\d_]")


def detect_language(text: str, stt_code: str | None, current: str) -> str:
    """Language of one caller utterance: "en", "hi", "te", or "other".

    Digits-only utterances ("97030 65715") keep the current language: a number says nothing about it.
    """
    if not _LETTERS.search(text):
        return current
    # Script first: STT's language code can be wrong while the script is right (scribe_v3_live
    # labelled Telugu-script text "hi" in testing). The code only decides for Latin-script text.
    if re.search(r"[\u0C00-\u0C7F]", text):  # Telugu block
        return "te"
    if re.search(r"[\u0900-\u097F]", text):  # Devanagari block
        return "hi"
    if stt_code:
        return _STT_CODES.get(stt_code.lower(), "other")
    return "en" if re.search(r"[a-zA-Z]", text) else "other"


class LanguageRouter(FrameProcessor):
    """Place after STT. On each final transcript, switches the TTS switcher to the right voice model."""

    def __init__(self, fast_tts, telugu_tts, pin_stt: bool):
        super().__init__()
        self._fast, self._telugu = fast_tts, telugu_tts
        self._pin_stt = pin_stt  # STT is in auto mode: lock it to the first language heard
        self.language = "en"

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            lang = detect_language(frame.text, frame.language, self.language)
            if self._pin_stt and lang in SUPPORTED and _LETTERS.search(frame.text):
                # Realtime auto-detection turned Telugu into Hindi-script text in testing; pinned Telugu
                # was far better. Trade-off: after this, mid-call language switches are rarely recognised.
                self._pin_stt = False
                logger.info(f"LANGUAGE pinning STT to {lang!r} for the rest of the call")
                delta = ElevenLabsRealtimeSTTService.Settings(language=lang, secondary_languages=None)
                await self.push_frame(STTUpdateSettingsFrame(delta=delta), FrameDirection.UPSTREAM)
            if lang != self.language:
                logger.info(f"LANGUAGE {self.language} -> {lang} (stt said {frame.language!r})")
                was_telugu, self.language = self.language == "te", lang
                if was_telugu != (lang == "te"):  # switch before this turn's reply reaches the TTS
                    service = self._telugu if lang == "te" else self._fast
                    await self.push_frame(ManuallySwitchServiceFrame(service=service), direction)
        await self.push_frame(frame, direction)
