"""Per-turn latency log: end of speech -> final STT text -> turn ends -> first LLM token -> first bot audio."""

import time

from loguru import logger
from pipecat.frames.frames import (
    LLMTextFrame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    UserStoppedSpeakingFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.observers.base_observer import BaseObserver, FramePushed


class LatencyLogger(BaseObserver):
    def __init__(self, vad_stop_secs):
        super().__init__()
        self._vad_stop_secs = vad_stop_secs  # callable: the VAD's stop delay changes during the call
        self._t: dict[str, float] = {}

    async def on_push_frame(self, data: FramePushed):
        if not data.first_push:
            return  # every frame is observed at each hop; only its first push counts
        f, now, t = data.frame, time.monotonic(), self._t
        if isinstance(f, VADUserStartedSpeakingFrame):
            t.clear()
        elif isinstance(f, VADUserStoppedSpeakingFrame):
            # VAD fires stop_secs after the caller actually went quiet
            t["speech_end"] = now - self._vad_stop_secs()
        elif isinstance(f, TranscriptionFrame) and "speech_end" in t:
            t["stt"] = now  # last final segment of the utterance
        elif isinstance(f, UserStoppedSpeakingFrame) and "speech_end" in t:
            t.setdefault("turn_end", now)
        elif isinstance(f, LLMTextFrame) and "turn_end" in t:
            t.setdefault("llm", now)
        elif isinstance(f, TTSAudioRawFrame) and "turn_end" in t and "audio" not in t:
            t["audio"] = now
            s = t["speech_end"]
            ms = lambda k: f"{(t[k] - s) * 1000:5.0f}ms" if k in t else "    -  "  # noqa: E731
            logger.info(
                f"LATENCY from end of speech: STT text {ms('stt')} | turn ends {ms('turn_end')} | "
                f"first LLM token {ms('llm')} | first audio {ms('audio')}"
            )
