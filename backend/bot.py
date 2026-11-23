"""Minimal voice receptionist: browser mic -> ElevenLabs STT -> Gemini -> ElevenLabs TTS -> browser speaker.

Run: python bot.py  then open http://localhost:7860/client
"""

import os
from datetime import date

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
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

import db
from api import router as api_router
from events import bus
from seed import seed_if_empty
from tools import Session, make_tools
from transcript import AssistantTranscript, UserTranscript

load_dotenv(override=True)

SYSTEM_PROMPT = """You are Ava, the phone receptionist at Sunrise Clinic.
You help callers check doctor availability, book appointments and cancel appointments.
Today is {today}. Our doctors: {doctors}.

Your replies are spoken aloud: one or two short sentences, plain words, no lists, no markdown,
no emojis. Say times like "ten thirty AM" and dates like "Wednesday the 25th".

Phone number flow. Follow it exactly, it is the only way callers are identified:
1. Before booking or cancelling, ask for the caller's 10-digit phone number.
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
    seed_if_empty(conn)
    doctors = "; ".join(f"{d['name']}, {d['specialty']}" for d in db.all_doctors(conn))
    conn.close()
    prompt = SYSTEM_PROMPT.format(today=date.today().strftime("%A, %Y-%m-%d"), doctors=doctors)

    transport = await create_transport(
        runner_args,
        {"webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True)},
    )

    stt = ElevenLabsRealtimeSTTService(api_key=os.environ["ELEVENLABS_API_KEY"])
    tts = ElevenLabsTTSService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        settings=ElevenLabsTTSService.Settings(
            # Rachel, a stock ElevenLabs voice available on free accounts
            voice=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
        ),
    )
    llm = GoogleLLMService(
        api_key=os.environ["GOOGLE_API_KEY"],
        settings=GoogleLLMService.Settings(system_instruction=prompt),
    )

    # Direct-function tools: Pipecat reads their schemas and registers them with the LLM.
    context = LLMContext(tools=make_tools(Session()))
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
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
    main()
