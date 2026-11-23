"""Transcript taps publish lines and pass every frame through unchanged."""

import asyncio

from pipecat.frames.frames import (
    InterimTranscriptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TranscriptionFrame,
)
from pipecat.tests.utils import run_test

from events import bus
from transcript import AssistantTranscript, UserTranscript


def drain(q):
    out = []
    while not q.empty():
        e = q.get_nowait()
        if e["type"] == "transcript":
            out.append((e["role"], e["text"], e["final"]))
    return out


def test_user_transcript():
    frames = [InterimTranscriptionFrame("my num", "u", "t"), TranscriptionFrame("my number is", "u", "t")]
    with bus.subscribe() as q:
        asyncio.run(run_test(UserTranscript(), frames_to_send=frames,
                             expected_down_frames=[InterimTranscriptionFrame, TranscriptionFrame]))
        assert drain(q) == [("user", "my num", False), ("user", "my number is", True)]


def test_assistant_transcript_joins_tokens():
    frames = [LLMFullResponseStartFrame(), LLMTextFrame("Hello"), LLMTextFrame(" there."), LLMFullResponseEndFrame()]
    with bus.subscribe() as q:
        asyncio.run(run_test(AssistantTranscript(), frames_to_send=frames,
                             expected_down_frames=[type(f) for f in frames]))
        assert drain(q) == [("assistant", "Hello", False), ("assistant", "Hello there.", False),
                            ("assistant", "Hello there.", True)]
