"""Pipeline taps that publish transcript lines to the event bus. Frames pass through untouched.

Each event carries the whole line so far; final=False lines are updates the dashboard replaces.
"""

from loguru import logger
from pipecat.frames.frames import (
    InterimTranscriptionFrame,
    InterruptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TranscriptionFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from events import bus


class UserTranscript(FrameProcessor):
    """Place right after STT."""

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, InterimTranscriptionFrame) and frame.text.strip():
            bus.publish("transcript", role="user", text=frame.text.strip(), final=False)
        elif isinstance(frame, TranscriptionFrame) and frame.text.strip():
            logger.info(f"USER (STT heard): {frame.text.strip()}")
            bus.publish("transcript", role="user", text=frame.text.strip(), final=True)
        await self.push_frame(frame, direction)


class AssistantTranscript(FrameProcessor):
    """Place right before TTS. Collects streamed LLM tokens into one line per response."""

    def __init__(self, on_line=None):
        super().__init__()
        self._text = ""
        self._on_line = on_line  # called with each finished bot line

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._text = ""
        elif isinstance(frame, LLMTextFrame):
            self._text += frame.text
            if self._text.strip():
                bus.publish("transcript", role="assistant", text=self._text.strip(), final=False)
        elif isinstance(frame, (LLMFullResponseEndFrame, InterruptionFrame)):
            # interrupted lines are closed too, with whatever the bot had produced
            if self._text.strip():
                logger.info(f"BOT said: {self._text.strip()}")
                bus.publish("transcript", role="assistant", text=self._text.strip(), final=True)
                if self._on_line:
                    self._on_line(self._text.strip())
            self._text = ""
        await self.push_frame(frame, direction)
