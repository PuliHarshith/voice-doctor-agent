"""Minimal voice receptionist: browser mic -> ElevenLabs STT -> Gemini -> ElevenLabs TTS -> browser speaker.

Run: python bot.py  then open http://localhost:7860/client
"""

import os
import sys
from datetime import date

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.turn.smart_turn.base_smart_turn import SmartTurnParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.elevenlabs.stt import ElevenLabsRealtimeSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies

import db
from api import router as api_router
from events import bus
from seed import ensure_seeded
from tools import Session, make_tools
from transcript import AssistantTranscript, UserTranscript

load_dotenv(override=True)

SYSTEM_PROMPT = """You are Ava, the phone receptionist at Sunrise Clinic.
You help callers check doctor availability, book appointments and cancel appointments.
Today is {today}. Our doctors: {doctors}.

Your replies are spoken aloud: one or two short sentences, plain words, no lists, no markdown,
no emojis. Say times like "ten thirty AM" and dates like "Wednesday the 25th".

Phone number flow. Follow it exactly, it is the only way callers are identified:
1. Before booking or cancelling, ask for the caller's 10-digit phone number, all ten digits in one go.
   If you get fewer than ten digits, the rest may follow in the caller's next message: join them up.
   Only ask again if the caller has clearly finished and digits are still missing.
2. Read it back digit by digit, written as separated digits, e.g. "That's 9 8 7 6 5, 4 3 2 1 0. Is that right?"
   That message must contain only this number, no other digits.
3. Wait for the caller to clearly say yes. If they say no or correct a digit, ask again and repeat step 2.
4. Only after the yes, call confirm_phone_number. If it returns an error, follow what it says.
Never book or cancel without a confirmed number, and never invent or guess digits.

Booking: use check_doctor_availability, offer two or three times, and once the caller picks one,
call book_appointment with the date as YYYY-MM-DD. Then repeat the doctor, day and time.
Cancelling: call cancel_appointment; if several come back, ask which one.
Checking availability does not need a phone number.
If a tool returns an error, explain it simply and offer the next step. Never claim something was
booked or cancelled unless the tool said so."""


async def bot(runner_args: RunnerArguments):
    conn = db.connect()
    ensure_seeded(conn)  # also per call: a server left running past midnight still gets a full week
    doctors = "; ".join(f"{d['name']}, {d['specialty']}" for d in db.all_doctors(conn))
    conn.close()
    prompt = SYSTEM_PROMPT.format(today=date.today().strftime("%A, %Y-%m-%d"), doctors=doctors)

    transport = await create_transport(
        runner_args,
        {"webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True)},
    )

    stt = ElevenLabsRealtimeSTTService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        settings=ElevenLabsRealtimeSTTService.Settings(
            # Explicit English: auto-detect can flip to Hindi etc. on an Indian accent. Scribe has no
            # en-IN variant; "en" and "en-IN" both map to "eng".
            language=os.getenv("STT_LANGUAGE") or "en",
            model=os.getenv("STT_MODEL") or "scribe_v2_realtime",  # the streaming model
        ),
    )
    tts = ElevenLabsTTSService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        settings=ElevenLabsTTSService.Settings(
            # Sarah, a *premade* voice: free-tier API keys get 402 on library voices (no audio at all)
            voice=os.getenv("ELEVENLABS_VOICE_ID") or "EXAVITQu4vr4xnSDxMaL",
        ),
    )
    llm = GoogleLLMService(
        api_key=os.environ["GOOGLE_API_KEY"],
        # Free-tier quota is per model per day (gemini-3.6-flash: only 20 requests), so the model is
        # swappable from .env when one runs out. flash-lite measured ~1s to first token.
        settings=GoogleLLMService.Settings(
            model=os.getenv("GEMINI_MODEL") or "gemini-3.5-flash-lite", system_instruction=prompt
        ),
        # Free-tier first-token latency occasionally spikes to ~10s; re-issue instead of waiting.
        retry_on_timeout=True,
        retry_timeout_secs=4.0,
    )

    # Direct-function tools: Pipecat reads their schemas and registers them with the LLM.
    context = LLMContext(tools=make_tools(Session()))
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            # Each VAD stop makes ElevenLabs finalise the audio so far and lets the turn end. Pipecat's 0.2s
            # default (and 0.6s) split phone numbers at the pauses between digit groups: "9700." / "306." /
            # "3715" arrived as three turns. 1.0s keeps a number in one piece; costs ~0.4s per reply.
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(stop_secs=float(os.getenv("VAD_STOP_SECS") or 1.0))
            ),
            # Smart Turn decides when the caller has finished. If it thinks they haven't, it waits
            # this long in silence before answering anyway (default 3s felt dead on the line).
            # Not lower: callers pause between digit groups when giving a phone number.
            user_turn_strategies=UserTurnStrategies(
                stop=[TurnAnalyzerUserTurnStopStrategy(
                    turn_analyzer=LocalSmartTurnAnalyzerV3(
                        params=SmartTurnParams(stop_secs=float(os.getenv("TURN_SILENCE_SECS") or 2.0))
                    )
                )]
            ),
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            UserTranscript(),  # user text after STT
            aggregators.user(),
            llm,
            AssistantTranscript(),  # assistant text before TTS
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Client connected")
        bus.publish("call_status", status="connected")
        context.add_message({"role": "user", "content": "The caller just connected. Greet them briefly and ask how you can help."})
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        bus.publish("call_status", status="ended")
        await task.cancel()

    try:
        await PipelineRunner(handle_sigint=runner_args.handle_sigint).run(task)
    finally:
        bus.publish("call_status", status="ended")  # also covers crashes; no-op if already ended


if __name__ == "__main__":
    from pipecat.runner.run import app, main

    # The runner applies this list to its CORS middleware. Vite dev server + the runner's own /client page.
    os.environ.setdefault(
        "PIPECAT_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:7860,http://127.0.0.1:7860",
    )
    app.include_router(api_router)

    # Startup check: fail loudly here rather than mid-call if the DB is missing or empty.
    startup_conn = db.connect()
    ensure_seeded(startup_conn)
    startup_conn.close()

    if sys.platform == "win32":
        # shortcut: on Windows uvicorn uses the Proactor loop, whose UDP sockets stop reading for good
        # after one ICMP "port unreachable" (CPython _ProactorDatagramTransport._loop_reading). ICE probes
        # the browser's closed candidate ports, so WebRTC never connects. The selector loop keeps reading.
        # Pipecat's runner calls uvicorn.run(app, host, port) without a loop option, so set it here.
        # Remove once CPython fixes the Proactor datagram read loop.
        import functools

        import uvicorn

        uvicorn.run = functools.partial(uvicorn.run, loop="asyncio:SelectorEventLoop")

    main()
