# Bugs we hit

Real bugs from building and testing this, one line each: **what happened → cause → fix.**

## Voice loop
- **WebRTC never connected on Windows** → uvicorn's default Proactor event loop stops reading UDP after one ICMP "port unreachable", which happens during normal ICE probing → run uvicorn on the selector event loop (`bot.py`).
- **Ava was silent: TTS produced no audio** → the voice ID was from the Voice Library, and free ElevenLabs keys get HTTP 402 for those → default to the built-in voice Sarah.
- **Ava went silent mid-call** → free-tier Gemini sometimes takes 12 s or more, or never answers → after 8 s Ava says "Sorry, one moment." and asks again; a second stall asks the caller to repeat.
- **The STT sometimes heard an Indian-accented caller as Hindi** → language auto-detect → STT language set to English explicitly.
- **The ElevenLabs account stopped working mid-project** → the monthly character quota ran out → new key; test calls now use a Windows text-to-speech voice as the caller, so only Ava's replies use credits.

## Phone number (the identity check)
- **Numbers arrived in pieces ("9700." / "306." / "3715" as three turns)** → the VAD ended the turn on the pauses between digit groups → longer silence allowed only while a number is expected (0.8 s, otherwise 0.5 s), plus Smart Turn and a prompt line to join the pieces.
- **Every confirmation failed, so booking was impossible** → Gemini puts non-dict message objects in the conversation history, and reading them raised AttributeError → read only the text, skip anything else.
- **A read-back with an extra digit was accepted** → substring match → the read-back must normalise to exactly the confirmed number.
- **Rejecting a new number kept the old confirmed number, so a booking could silently go to it** → each confirm attempt now clears the old number first.
- **Gemini called confirm before reading the number back** → caught by the code check, which refuses → working as designed; the error tells Gemini what to do.
- **A caller who talked over the read-back couldn't confirm** → the history keeps only what Ava said before the interruption, so it holds a cut-off number → correct refusal; Ava reads the number again.

## Booking and cancelling
- **A slot earlier today that had already passed could be booked** → no time-of-day check → refused, with an offer of a later time.
- **TTS read "9:00" as "nine zero zero"** → times passed as raw "HH:MM" → tools speak whole hours as "9 AM".
- **Ava cancelled without asking which appointment** → with only one booking, the tool cancelled on the first call → without an id it now only lists appointments; Ava confirms one, then cancels by id.

## Config and data
- **`DB_PATH` in .env was ignored** → `db.py` read it at import, before `.env` was loaded → read after loading, and the path made absolute.

## Dashboard
- **After "Microphone blocked", the call screen flipped to "Connected" anyway** → the abandoned connection kept connecting in the background → callbacks from an abandoned connection are ignored and it is hung up.
- **The ended screen showed 00:00** → the connect time was cleared on hang-up → the end time is kept, so the ended screen shows the call length.
- **The voice meters stayed flat** → the WebRTC transport never sends audio-level events → measure the tracks with a Web Audio AnalyserNode.
- **The row flash happened behind the phone** → the phone covered the middle of the screen → on wide screens it covers only the call column.
