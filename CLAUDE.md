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
Original design, written from scratch: no UI kit, no animation library, no template code or assets. All
tokens are CSS variables in `frontend/src/styles.css`; use them, never raw values.

- Layout (1440px): slim top bar (serif wordmark, clock, Live/Offline marker for the event stream, status pill, Paper | Ink switch, Try Call). Then:
  four stat figures (the fourth is the next booked visit with a live countdown); two charts (This week, Doctor load); the Doctors timeline; Transcript beside
  Appointments; a footer line "Pipecat · ElevenLabs · Gemini". No sidebar.
- Background: a faint dot grid (`--dot`, 16px apart) on a fixed canvas behind the board, visible in the
  24px gutters; dots within 170px of the mouse grow and take `--green-ink`. Redraws only on pointer
  movement; static under reduced motion and on touch.
- Call sheet: docked right on wide screens (the board makes room, nothing covered; the board hides its own
  transcript during a call), full-screen on phones. Its hero is the only gradient: deep green
  (#0B3A35) with SVG grain, an 80px timer, the voice ribbon and "reply 0.0 s".
- 390px: everything stacks; figures sit two by two; Appointments has a search box (phone digits or doctor); charts stack; the axis shows every third hour;
  the table hides Doctor and moves the time under the date; clock and status pill hide.
- GitHub Pages demo (`.github/workflows/pages.yml`): built with VITE_DEMO=1, it reads the bundled
  `frontend/public/demo.json` snapshot (dates shifted to today), opens no event stream, disables Try Call
  and shows a one-line banner. Refresh the snapshot from a running backend after `python seed.py`.
- Dev-only preview: `localhost:5173/?preview` shows the call sheet mid-call with a sample conversation
  (`frontend/src/preview.ts`), for README screenshots. It is compiled out of production builds.
- Themes: Paper (default) and Ink via `html[data-theme]`, saved in localStorage inside try/catch,
  applied before first paint by index.html.
- Colour discipline:
  - `--accent` deep teal (#0F6E6A / #4FB3A9) ONLY for Try Call, booked slots (and the Booked series in the
    week chart), the "now" needle and Ava's voice.
  - `--green-ink` (#134E44 / #9FD6CB) for headings, key numbers, free-slot outlines, the Booked pill,
    doctor-load bars, focus rings and highlights; `--green-wash` / `--green-line` are its tints.
  - Neutrals: `--page` #F5F2EC / #12110F, `--surface` #FFF / #1A1917, `--sunken`, `--ink` #1B1A17 /
    #EEEAE2, `--ink-2` (64% / 66%, secondary text), `--ink-label` (74%, small caps), `--ink-3` (marks only,
    never text), `--line`, `--line-soft` (row dividers), `--muted-wash` (Cancelled pill), `--chart-free`.
  - Every text pair measured >= 4.5:1 in both themes (lowest 4.84, the Cancelled pill).
- Type: four steps, serif (Fraunces) for headings and numbers, sans (Inter) for UI:
  `--t-display` 60 (stat numbers), `--t-heading` 22 (headings, wordmark, Ava, confirmed number),
  `--t-body` 14, `--t-label` 11 (small caps, the smallest text anywhere); plus `--t-small` 12 (secondary
  lines), `--t-day` 18 (day tabs), `--t-timer` 80. Tabular numerals on every number, time and phone number.
- One time format everywhere: 12-hour with AM/PM ("5:30 PM", axis "9 AM").
- Space `--s-1` 4 to `--s4` 32 on a 4/8px rhythm. Radii: `--r-box` 12, `--r-sheet` 24, `--r-control` 8,
  `--r-bubble` 14, `--r-pill`. Hairlines, no shadows.
- Timeline: one axis for the clinic day; on today the passed hours collapse into a hatched "Earlier"
  strip; free = green-ink outlined chip, booked = solid accent chip with its time; hover shows time and
  status; opens on the next day with free slots when today has fewer than 4 left; days with nothing free
  are disabled.
- Charts (real data only): This week = stacked columns per day (booked accent, free `--chart-free`, 24px
  max, 2px gap, rounded data end); Doctor load = share of each doctor's week booked, one hue. Hover
  tooltips, legend for two series, values in text colours.
- Motion: every one-shot animation <= 350ms (fades, stamp, wash in 150ms / out 350ms, read-back digits,
  check mark, chart transitions); two ambient loops (ringing dot, empty-state ruler). All guarded by
  prefers-reduced-motion (loops play once, the ribbon stays flat, scrolling is instant).
- Copy: Try Call, Transcript, Doctors, Appointments, End call, Booked, Cancelled, Free; empty transcript
  "Press Try Call to start".
- Touch: controls at least 44px tall on touch screens.

## Working rules
- Never commit `.env` or keys.
- Keep the code small enough to explain line by line.
