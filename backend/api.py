"""Dashboard API, mounted on the Pipecat runner's own FastAPI app (no second server).

The call itself still goes through the runner's WebRTC routes (/start, /api/offer).
/api/call/start and /api/call/end only track call state for the dashboard.
"""

import asyncio
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

import db
from events import bus

router = APIRouter(prefix="/api")
HEARTBEAT_SECS = 15


@router.get("/doctors")
def doctors():
    conn = db.connect()
    try:
        return db.doctors_with_slots(conn)
    finally:
        conn.close()


@router.get("/appointments")
def appointments():
    conn = db.connect()
    try:
        return db.all_appointments(conn)
    finally:
        conn.close()


@router.post("/call/start")
def call_start():
    # "ringing" until the browser's WebRTC connection reaches the bot, which then publishes "connected"
    if bus.call_status != "connected":
        bus.publish("call_status", status="ringing")
    return {"status": bus.call_status}


@router.post("/call/end")
def call_end():
    bus.publish("call_status", status="ended")
    return {"status": bus.call_status}


@router.get("/events")
async def events():
    async def stream():
        with bus.subscribe() as q:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), HEARTBEAT_SECS)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"  # SSE comment, keeps proxies and the browser from closing it

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
