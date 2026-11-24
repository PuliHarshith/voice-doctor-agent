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

## Design rules (frontend): "operations console"
Original design, written from scratch: no UI kit, no animation library, no template code, markup, class
names, icons or assets. Information density that stays readable. All tokens are CSS variables in
`frontend/src/styles.css`; use them, never raw values.

- Layout (1440px): slim top bar (wordmark, live clock, status pill, theme toggle, Try Call). Row 1: three
  plain figures (Booked today, Free slots, Cancelled today; all counted for today's date). Row 2: doctor
  day lanes with the slot timeline. Row 3: Transcript (chat widget, large confirmed number on top) beside
  Appointments (table, newest first). No sidebar or menus.
- Call sheet: on wide screens docked on the right while the board makes room (nothing is covered, so lane
  stamps and row flashes stay visible); on phones a full-screen overlay. Holds state, timer, read-back,
  Listening/Thinking/Speaking, voice ribbon, confirmation card, chat, Mute, End call.
- 390px: figures stay three across; lanes stack name over track; the table drops Doctor and moves the
  time under the date; the clock and status pill hide.
- Themes: Paper (light, default) and Ink (dark) via `html[data-theme]`, toggled in the top bar, saved in
  localStorage inside try/catch, applied before first paint by a script in index.html.
- Colour tokens (Paper / Ink):
  - `--page` #F5F2EC / #12110F; `--surface` #FFFFFF / #1A1917; `--sunken` #F0ECE4 / #24221F
  - `--ink` #1B1A17 / #EEEAE2; `--ink-2` ink at 64% / 66% (secondary text); `--ink-3` 28% / 24% (idle marks, never text)
  - `--line` #E3DED4 / #2D2B27
  - ONE accent `--accent` deep teal #0F6E6A / #4FB3A9, `--on-accent` #FFFFFF / #0C1413,
    `--accent-wash` accent at 10% / 14% (Booked pill, Ava's bubbles, row flash)
  - `--muted-wash` #ECE8E0 / #262420 (Cancelled pill); `--scrim` ink 32% / black 50% (phone overlay)
- Type: `--display` Fraunces (650-750, optical size set per use) for the wordmark, headings, figures, day
  numbers and the read-back; `--sans` Inter for UI. Sizes: `--t-xs` 11, `--t-sm` 12, `--t-md` 14 (body),
  `--t-lg` 16, `--t-h2` 22, `--t-wordmark` 22, `--t-number` 30, `--t-figure` 40 px (smaller on phones).
  Tabular numerals for every number, time and phone number.
- Space: `--s-1` 4, `--s0` 8, `--s1` 12, `--s2` 16, `--s3` 24, `--s4` 32 px.
- Shape: `--r-box` 12, `--r-sheet` 24, `--r-control` 8, `--r-bubble` 14, `--r-pill` 999 px. 1px hairlines,
  no shadows. Frame: `--bar-h` 56, `--sheet-w` 380, `--chat-w` 400 px.
- Signature moments: a "now" marker crossing today's lanes; a booked slot stamped onto its lane (scale in,
  no overshoot); the read-back typing the confirmed number digit by digit, then drawing a check mark; a
  hand-drawn voice ribbon (SVG path from the AnalyserNode waveform; caller in ink, Ava in teal).
- Icons: only call, mute and end call; 1.5px stroke, drawn in `components/Icon.tsx`.
- Banned: sidebars with menu groups, icon-in-circle tiles, charts, greetings, stock illustrations,
  gradients, emojis, marketing copy. Copy: Try Call, Transcript, Doctors, Appointments, End call,
  Booked, Cancelled, Free.
- Motion: short fades (200ms or less), the stamp and row flash, the ribbon; all of it honours
  prefers-reduced-motion (the read-back shows the full number at once). Visible 2px accent focus ring.
- Touch: controls at least 44px tall on touch screens.

## Working rules
- Never commit `.env` or keys.
- Keep the code small enough to explain line by line.
