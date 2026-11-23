"""In-memory event bus: the bot and tools publish, each SSE client gets its own queue."""

import asyncio
import time
from contextlib import contextmanager

from loguru import logger


class EventBus:
    def __init__(self):
        self._queues: set[asyncio.Queue] = set()
        self.call_status = "idle"  # idle until the first call; then ringing/connected/ended

    def publish(self, type: str, **data) -> None:
        if type == "call_status":
            if data["status"] == self.call_status:
                return  # e.g. /api/call/end after the bot already reported the hang-up
            self.call_status = data["status"]
        event = {"type": type, "ts": time.time(), **data}
        for q in self._queues:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("SSE client too slow, dropping event")  # never block the voice pipeline

    @contextmanager
    def subscribe(self):
        q = asyncio.Queue(maxsize=500)
        # a client joining mid-call needs to know where things stand first
        q.put_nowait({"type": "call_status", "ts": time.time(), "status": self.call_status})
        self._queues.add(q)
        try:
            yield q
        finally:
            self._queues.discard(q)


bus = EventBus()
