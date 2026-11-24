# Pipeline

This is a map of how one call moves through the code. Each step names the file it lives in.

## The call path

```
browser mic ──WebRTC──▶ transport.input()
                          │  Silero VAD: is the caller talking?
                          ▼
                        ElevenLabs STT          (streaming; text arrives while you speak)
                          ▼
                        UserTranscript          ─▶ dashboard: your words
                          ▼
                        user aggregator         Smart Turn v3: have you finished your turn?
                          ▼
                        Gemini (LLM)  ◀──▶ tools: check / confirm number / book / cancel ─▶ SQLite
                          ▼
                        AssistantTranscript     ─▶ dashboard: Ava's words
                          ▼
                        ElevenLabs TTS          (streams audio as the text arrives)
                          ▼
browser speaker ◀─WebRTC── transport.output()
                          ▼
                        assistant aggregator    stores what Ava actually said in the conversation history
```

All of this is built in `bot()` in [backend/bot.py](backend/bot.py). Each box is a Pipecat processor, and audio and text pass through them in order.

1. **Transport.** Pipecat's SmallWebRTC transport is a direct peer-to-peer WebRTC connection between the browser and the Python process. No media server sits in between. The browser asks for echo cancellation, noise suppression and auto gain on the mic ([frontend/src/useCall.ts](frontend/src/useCall.ts)).
2. **Speech to text.** ElevenLabs Scribe v2 Realtime, forced to English. Partial text arrives while the caller is still talking. The final text is committed when the VAD says the caller stopped.
3. **Turn taking.** This happens in two stages.
   - Silero VAD detects speech start and stop. The silence needed to count as "stopped" is longer (0.8 s) right after Ava asks for a phone number, so pauses between digit groups don't cut the caller off. Otherwise it is 0.5 s.
   - Smart Turn v3, a small local model, then decides whether the sentence is finished before Gemini is called.
   - To interrupt Ava, the caller has to say at least two words, so a cough doesn't stop her.
4. **LLM.** `gemini-3.5-flash-lite`, guided by the system prompt in `bot.py`: short spoken sentences, no lists, and always read the number back.
5. **Text to speech.** ElevenLabs Flash v2.5 streams audio sentence by sentence, so Ava starts speaking before Gemini has finished writing.
6. **History.** The assistant aggregator records only what Ava actually said before any interruption. That matters for the number check described below.

## Tools ([backend/tools.py](backend/tools.py))

Gemini calls these as Pipecat function calls. Each one reads or writes SQLite ([backend/db.py](backend/db.py)).

| Tool | What it does |
|---|---|
| `check_doctor_availability` | Free slots by doctor or specialty, date, or both. Gemini turns "tomorrow" into a date, using the "Today is …" line in the prompt. |
| `confirm_phone_number` | Saves the caller's number for this call, but only if checks in code pass (below). |
| `book_appointment` | Books a slot under the confirmed number. Refuses if no number is confirmed or the slot is taken. |
| `cancel_appointment` | Called without an id, it only lists the confirmed number's upcoming appointments. Ava names one and asks "Shall I cancel it?", and only after a yes calls again with that id. The row is set to `cancelled`, never deleted. |

**Why confirming the number is checked in code.** The caller is identified only by the number they say, so a misheard digit would book under someone else's number. The prompt asks Gemini to read the number back, but a prompt can't guarantee it. So before `confirm_phone_number` accepts a number, the code checks two things:

- the last thing Ava said contains exactly this number;
- the caller's next reply is a yes.

Book and cancel refuse until a number has been confirmed. If the caller interrupts the read-back, the history holds a cut-off number, the check fails, and Ava reads the number again.

Spoken numbers are turned into digits in [backend/phone.py](backend/phone.py), which handles "double five", "nine eight seven…" and digit groups.

## Dashboard updates ([backend/events.py](backend/events.py), [backend/api.py](backend/api.py))

The pipeline and the tools publish events to a small in-process bus:

- `transcript`
- `phone_confirmed`
- `appointment_booked` and `appointment_cancelled`
- `slots_changed`
- `call_status`

The bus streams them to the browser as Server-Sent Events on `/api/events`. The dashboard loads the full state once from `/api/doctors` and `/api/appointments`, then applies each event as it arrives. It reloads everything after a reconnect, so missed events don't matter.

The Listening / Thinking / Speaking label on the call screen does not come from this bus. It comes from Pipecat's own client events (RTVI), sent over the WebRTC data channel.

## Where the time goes

Measured from the moment you stop talking to the first sound back, by [backend/latency.py](backend/latency.py):

- **Plain replies:** 1.8–2.9 s.
- **Replies that need a tool:** 3–5 s, because Gemini runs twice.
- **The biggest variable is Gemini:** 0.6–2.5 s to its first word. TTS adds about 0.25 s.
