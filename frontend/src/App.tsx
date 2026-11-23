import { useCallback, useRef, useState } from 'react'
import { apptKey, getJSON, slotKey, type Appointment, type Doctor, type ServerEvent } from './api'
import { useCall } from './useCall'
import { useEvents } from './useEvents'
import { CallConsole } from './components/CallConsole'
import { Transcript, type Line } from './components/Transcript'
import { Schedule } from './components/Schedule'
import { Ledger } from './components/Ledger'

const FLASH_MS = 2400

/** A line still being spoken (final=false) is updated in place; anything else starts a new line. */
function mergeLine(lines: Line[], e: Extract<ServerEvent, { type: 'transcript' }>, id: number): Line[] {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].role === e.role && !lines[i].final) {
      const next = [...lines]
      next[i] = { ...lines[i], text: e.text, final: e.final }
      return next
    }
  }
  return [...lines, { id, role: e.role, text: e.text, final: e.final }]
}

const markSlot = (doctors: Doctor[] | null, a: Appointment, booked: boolean) =>
  doctors?.map((d) =>
    d.id !== a.doctor_id
      ? d
      : { ...d, slots: d.slots.map((s) => (s.date === a.date && s.time === a.time ? { ...s, is_booked: booked } : s)) },
  ) ?? null

export default function App() {
  const [doctors, setDoctors] = useState<Doctor[] | null>(null)
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [day, setDay] = useState<string | null>(null)
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set())
  const lineId = useRef(0)
  const call = useCall()

  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([getJSON<Doctor[]>('/api/doctors'), getJSON<Appointment[]>('/api/appointments')])
      setDoctors(d)
      setAppointments(a)
      setLoadFailed(false)
    } catch (err) {
      console.error(err)
      setLoadFailed(true)
    }
  }, [])

  const flash = useCallback((keys: string[]) => {
    setFlashing((s) => new Set([...s, ...keys]))
    setTimeout(
      () =>
        setFlashing((s) => {
          const next = new Set(s)
          keys.forEach((k) => next.delete(k))
          return next
        }),
      FLASH_MS,
    )
  }, [])

  const onEvent = useCallback(
    (e: ServerEvent) => {
      if (e.type === 'transcript') {
        setLines((ls) => mergeLine(ls, e, ++lineId.current))
      } else if (e.type === 'appointment_booked' || e.type === 'appointment_cancelled') {
        const a = e.appointment
        const booked = e.type === 'appointment_booked'
        setAppointments((as) => {
          const rest = (as ?? []).filter((x) => x.id !== a.id)
          // new bookings go to the top (newest first); a cancellation keeps its row in place
          return booked || !as?.some((x) => x.id === a.id) ? [a, ...rest] : as.map((x) => (x.id === a.id ? a : x))
        })
        setDoctors((ds) => markSlot(ds, a, booked))
        setDay(a.date) // bring the changed day into view so the flash is visible
        flash([apptKey(a.id), slotKey(a.doctor_id, a.date, a.time)])
      }
      // call_status: the console follows this browser's own WebRTC connection instead.
      // slots_changed: already applied above from the appointment payload.
    },
    [flash],
  )

  // Every (re)connect of the stream loads doctors + appointments, covering events missed while it was down.
  // The stream doubles as the health check: if /api/events can't connect, the backend is down.
  const link = useEvents(onEvent, load)
  const backendDown = link === 'reconnecting' || loadFailed

  const startCall = () => {
    setLines([])
    call.start()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Sunrise Clinic</h1>
          <span className="brand__sub">Front desk</span>
        </div>
        <span className={`link link--${link}`}>
          <span className="link__dot" />
          {link === 'live' ? 'Live' : link === 'connecting' ? 'Connecting' : 'Reconnecting'}
        </span>
      </header>

      {(backendDown || call.error) && (
        <div className="banners" role="status">
          {backendDown && <p className="banner">Backend unreachable. Start backend/bot.py; this page retries on its own.</p>}
          {call.error === 'mic-denied' && (
            <p className="banner">Microphone blocked. Allow microphone access for this site, then start the call again.</p>
          )}
          {call.error === 'unreachable' && <p className="banner">Couldn't connect the call. Is the backend running?</p>}
        </div>
      )}

      <main className="layout">
        <div className="col col--call">
          <CallConsole call={call} onStart={startCall} />
          <Transcript lines={lines} />
        </div>
        <div className="col col--work">
          {doctors ? (
            <Schedule doctors={doctors} day={day} onDay={setDay} flashing={flashing} />
          ) : (
            <section className="schedule">
              <header className="section-head"><h2>Availability</h2></header>
              <p className="empty">{backendDown ? 'Unavailable.' : 'Loading…'}</p>
            </section>
          )}
          {appointments ? (
            <Ledger appointments={appointments} flashing={flashing} />
          ) : (
            <section className="ledger">
              <header className="section-head"><h2>Appointments</h2></header>
              <p className="empty">{backendDown ? 'Unavailable.' : 'Loading…'}</p>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
