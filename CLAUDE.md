# Voice AI Doctor Appointment Assistant

Source of truth: `../task.pdf` (SDE Intern – Round 1). If this file and the PDF disagree, the PDF wins.

**Deadline: Wednesday 25 Nov, 11:00 PM IST.** Submit via the Google Form in the PDF, not by email reply.

## What we're building
A voice agent that a caller talks to in the browser. It can check a doctor's availability, book an appointment and cancel an appointment. It identifies the caller only by the phone number they say during the call. A web dashboard runs the call and shows what is happening.

## Required stack
- Voice pipeline: **Pipecat (Python)**, in `backend/`
- STT: **ElevenLabs**
- TTS: **ElevenLabs**
- LLM: our choice. Gemini is recommended (free quota). Any free LLM is fine. The README must name it.
- Frontend: any framework (React, Next.js or plain HTML), in `frontend/`

## Core requirements
### Part A: Pipecat pipeline
- [ ] Pipeline: caller audio → STT → LLM → TTS → caller audio, in real time
- [ ] Tools are registered in the Pipecat pipeline as LLM function calls, using these exact names:
  - [ ] `check_doctor_availability`: returns available slots for a doctor and/or date
  - [ ] `book_appointment`: books the chosen slot under the phone number the caller said
  - [ ] `cancel_appointment`: finds the caller's appointment by spoken phone number and cancels it
- [ ] Caller is identified **only** by the spoken phone number: no login, no OTP, no caller-ID
- [ ] Agent reads the number back and confirms it **before** booking or cancelling
- [ ] Doctors, specialities and slots are mock data: in-memory, a JSON file or SQLite
- [ ] Agent speaks naturally and handles all three actions end to end in one conversation

### Part B: Dashboard
- [ ] Start and end a voice call from the browser
- [ ] Live transcript
- [ ] List of doctors and their available slots
- [ ] List of appointments that updates after a booking or cancellation
- [ ] Looks professional and hand-tuned: minimal wording, no generic AI-template look

## Bonus (optional, only after core works)
- [ ] Backend: VAD in the pipeline, for example Silero
- [ ] Phone-style call screen opened by a **Try Call** button. States: ringing/connecting → connected → ended. Shows caller name, call timer, mute and end-call buttons, and the live transcript inside the phone.
- [ ] Extras: voice-reactive waveform, smooth state transitions, booking confirmation card in the phone, highlighted dashboard rows on book/cancel, ring and end-call sounds, mobile-friendly layout
- [ ] Any other improvements. These never replace core requirements.

## Deliverables
- [ ] GitHub repo with the full code (frontend and pipeline)
- [ ] README: how to run it, and which LLM is used
- [ ] No API keys committed. Ship `.env.example`.
- [ ] Video of up to 3 min showing one full flow: caller gives phone number → checks availability → books → booking appears on the dashboard
- [ ] Short, honest pipeline description written in my own words, not AI-generated
- [ ] Submit the repo link, video and description via the Google Form before the deadline

## Evaluation hints from the PDF
- The role is FDE (client-facing), so clarity and explaining the work count.
- AI tools are allowed, but I must be able to explain every part of the code.
- Frontend polish counts: "real, professional, top-notch work".
- Core requirements come first. Bonus work doesn't make up for missing core.

## Working rules
- Never commit `.env` or keys.
- Keep the code small enough to explain line by line.
