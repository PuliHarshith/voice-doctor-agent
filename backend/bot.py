"""Minimal voice receptionist: browser mic -> ElevenLabs STT -> Gemini -> ElevenLabs TTS -> browser speaker.

Run: python bot.py  then open http://localhost:7860/client
"""

import os
import sys

import aiohttp
import time
from datetime import date

from dotenv import load_dotenv

load_dotenv(override=True)  # before the local imports below: db.py reads DB_PATH at import time

from loguru import logger

from pipecat.audio.turn.smart_turn.base_smart_turn import SmartTurnParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMRunFrame, TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.service_switcher import ServiceSwitcher, ServiceSwitcherStrategyManual
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
from pipecat.services.elevenlabs.tts import ElevenLabsHttpTTSService, ElevenLabsTTSService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies

import db
from api import router as api_router
from events import bus
from phone import mentions_phone_number
from seed import ensure_seeded
from tools import Session, make_tools
from language import LanguageRouter
from latency import LatencyLogger
from transcript import AssistantTranscript, UserTranscript

# Silence before a phrase is final. Long while a phone number is expected (callers pause between digit
# groups and a short pause would end the turn mid-number), short otherwise (~0.5s faster replies).
VAD_STOP_SECS = float(os.getenv("VAD_STOP_SECS") or 1.0)
VAD_FAST_STOP_SECS = float(os.getenv("VAD_FAST_STOP_SECS") or 0.5)

SYSTEM_PROMPT = """You are Ava, the phone receptionist at Sunrise Clinic.
You help callers check doctor availability, book appointments and cancel appointments.
Today is {today}. Our doctors: {doctors}.

Your replies are spoken aloud: one or two short sentences, plain words, no lists, no markdown,
no emojis. Say times like "ten thirty AM" and dates like "Wednesday the 25th".

Languages: you speak English, Hindi and Telugu. Always reply in the language of the caller's latest
message, and switch whenever they switch. Write Hindi in Devanagari and Telugu in Telugu script.
Keep doctor names as they are. If the caller uses any other language, reply in English and say that
you can help in English, Hindi or Telugu.
Tool calls are always in English, whatever the caller's language: doctor names as listed above, dates
as YYYY-MM-DD, times like "10:30 AM". Tool results are in English; say them in the caller's language.

Phone number flow. Follow it exactly, it is the only way callers are identified:
1. Before booking or cancelling, ask for the caller's 10-digit phone number, all ten digits in one go.
   If you get fewer than ten digits, the rest may follow in the caller's next message: join them up.
   Only ask again if the caller has clearly finished and digits are still missing.
2. Read it back digit by digit in the caller's language and ask if it is right. In English write the
   digits, e.g. "That's 9 8 7 6 5, 4 3 2 1 0. Is that right?". In Hindi and Telugu write each digit as a
   word so it is spoken in that language, e.g. "नौ आठ सात छह पांच, चार तीन दो एक शून्य" or
   "తొమ్మిది ఎనిమిది ఏడు ఆరు ఐదు, నాలుగు మూడు రెండు ఒకటి సున్నా".
   That message must contain only this number, no other digits or number words.
3. Wait for the caller to clearly say yes. If they say no or correct a digit, ask again and repeat step 2.
4. Only after the yes, call confirm_phone_number. If it returns an error, follow what it says.
Never book or cancel without a confirmed number, and never invent or guess digits.

Booking: use check_doctor_availability, offer two or three times, and once the caller picks one,
call book_appointment with the date as YYYY-MM-DD. Then repeat the doctor, day and time.
Cancelling: call cancel_appointment; if several come back, ask which one.
Checking availability does not need a phone number.
If a tool returns an error, explain it simply and offer the next step. Never claim something was
booked or cancelled unless the tool said so."""


# Spoken when Gemini stalls (bot.say bypasses the LLM, so these can't be translated on the fly).
ONE_MOMENT = {"en": "Sorry, one moment.", "hi": "माफ़ कीजिए, एक पल।", "te": "క్షమించండి, ఒక్క క్షణం."}
GIVE_UP = {
    "en": "Sorry, I'm having trouble right now. Could you say that again?",
    "hi": "माफ़ कीजिए, अभी दिक्कत हो रही है। क्या आप फिर से बोलेंगे?",
    "te": "క్షమించండి, ఇప్పుడు సమస్య వస్తోంది. మళ్ళీ చెప్పగలరా?",
}


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

    stt_language = os.getenv("STT_LANGUAGE") or "auto"
    stt = ElevenLabsRealtimeSTTService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        include_language_detection=True,  # each final transcript says which language it heard
        settings=ElevenLabsRealtimeSTTService.Settings(
            # "auto": Scribe detects the language per utterance, limited to English/Hindi/Telugu via
            # secondary_languages. Open detection once heard synthetic Hindi as Russian (Cyrillic text).
            # Set "en" / "hi" / "te" to pin one language for better accuracy in single-language calls.
            language="en" if stt_language == "auto" else stt_language,
            secondary_languages=["hi", "te"] if stt_language == "auto" else None,
            model=os.getenv("STT_MODEL") or "scribe_v2_realtime",  # the streaming model
        ),
    )
    voice = os.getenv("ELEVENLABS_VOICE_ID") or "EXAVITQu4vr4xnSDxMaL"
    fast_tts = ElevenLabsTTSService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        settings=ElevenLabsTTSService.Settings(
            # Sarah, a *premade* voice: free-tier API keys get 402 on library voices (no audio at all)
            voice=voice,
            model=os.getenv("ELEVENLABS_TTS_MODEL") or "eleven_flash_v2_5",  # lowest-latency ElevenLabs model
            stability=float(os.getenv("ELEVENLABS_STABILITY") or 0.5),
            similarity_boost=float(os.getenv("ELEVENLABS_SIMILARITY") or 0.75),
        ),
    )
    # Telugu: Flash v2.5 doesn't support it; eleven_v3 does but rejects WebSocket streaming, so it runs
    # over HTTP (~1.0s to first audio vs ~0.35s). Voice settings left at v3 defaults (v3 only accepts
    # stability 0, 0.5 or 1).
    http_session = aiohttp.ClientSession()
    telugu_tts = ElevenLabsHttpTTSService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        aiohttp_session=http_session,
        settings=ElevenLabsHttpTTSService.Settings(
            voice=voice, model=os.getenv("ELEVENLABS_TELUGU_TTS_MODEL") or "eleven_v3"
        ),
    )
    tts = ServiceSwitcher(services=[fast_tts, telugu_tts], strategy_type=ServiceSwitcherStrategyManual)
    router = LanguageRouter(fast_tts, telugu_tts, pin_stt=stt_language == "auto")
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
        # After the retry, a stalled stream used to hang 20s in silence before erroring. Fail at 8s and
        # let on_completion_timeout (below) recover out loud.
        stream_idle_timeout_secs=8.0,
    )

    vad = SileroVADAnalyzer(params=VADParams(stop_secs=VAD_FAST_STOP_SECS))

    def adapt_vad(bot_line: str):
        want = VAD_STOP_SECS if mentions_phone_number(bot_line) else VAD_FAST_STOP_SECS
        if vad.params.stop_secs != want:  # set_params resets VAD state, so only on a real change
            vad.set_params(vad.params.model_copy(update={"stop_secs": want}))

    # Direct-function tools: Pipecat reads their schemas and registers them with the LLM.
    context = LLMContext(tools=make_tools(Session()))
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            # Each VAD stop makes ElevenLabs finalise the audio so far and lets the turn end. Pipecat's 0.2s
            # default (and 0.6s) split phone numbers at the pauses between digit groups: "9700." / "306." /
            # "3715" arrived as three turns. 1.0s keeps a number in one piece; costs ~0.4s per reply.
            vad_analyzer=vad,
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
            router,  # picks the TTS for the caller's language
            UserTranscript(),  # user text after STT
            aggregators.user(),
            llm,
            AssistantTranscript(on_line=adapt_vad),  # assistant text before TTS
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        observers=[LatencyLogger(lambda: vad.params.stop_secs)],
    )

    last_recovery = 0.0

    async def say(text: str, *then):
        # TTSSpeakFrame skips the LLM, so AssistantTranscript never sees it: log + publish it here.
        logger.info(f"BOT said: {text}")
        bus.publish("transcript", role="assistant", text=text, final=True)
        await task.queue_frames([TTSSpeakFrame(text), *then])

    @llm.event_handler("on_completion_timeout")
    async def on_completion_timeout(service):
        # Free-tier Gemini sometimes stalls. Never leave the caller in silence: apologise and ask the
        # model again (the context already holds any tool result). At most once per 30s, so a Gemini
        # outage can't loop "one moment" forever.
        nonlocal last_recovery
        if time.monotonic() - last_recovery < 30:
            logger.error("LLM timed out again; giving up on this turn")
            await say(GIVE_UP[router.language if router.language in GIVE_UP else "en"])
            return
        last_recovery = time.monotonic()
        logger.warning("LLM timed out; apologising and retrying")
        await say(ONE_MOMENT[router.language if router.language in ONE_MOMENT else "en"], LLMRunFrame())

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
        await http_session.close()


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
