import { useCallback, useEffect, useRef, useState } from 'react'
import { apptKey, getJSON, slotKey, type Appointment, type Doctor, type ServerEvent } from './api'
import { useCall } from './useCall'
import { useEvents } from './useEvents'
import { Clock } from './components/Clock'
import { Figures } from './components/Figures'
import { Phone } from './components/Phone'
import { Icon } from './components/Icon'
import { unlockTones } from './tones'
import { Transcript, type Line } from './components/Transcript'
import { Schedule } from './components/Schedule'
import { Ledger } from './components/Ledger'

const FLASH_MS = 2400
const STATE_LABEL = { idle: 'Idle', connecting: 'Ringing', connected: 'On call', ended: 'Ended' } as const

type Theme = 'paper' | 'ink'

/** Paper (light) or Ink (dark), remembered per browser. Storage can be blocked, so every access is guarded. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('theme') === 'ink' ? 'ink' : 'paper'
    } catch {
      return 'paper'
    }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // not saved: the choice lasts for this visit only
    }
  }, [theme])
  return [theme, setTheme] as const
}

/** A line still being spoken (final=false) is updated in place; anything else starts a new line. */
function mergeLine(lines: Line[], e: Extract<ServerEvent, { type: 'transcript' }>, id: number): Line[] {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].role === e.role && !lines[i].final) {
      const next = [...lines]
      next[i] = { ...lines[i], text: e.text, final: e.final }
      return next
    }
  }
  return [...lines, { id, role: e.role, text: e.text, final: e.final, ts: e.ts * 1000 }]
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
  const [phone, setPhone] = useState<string | null>(null) // caller's number once they confirm the read-back
  const [callAppt, setCallAppt] = useState<Appointment | null>(null) // booked/cancelled during this call
  const [day, setDay] = useState<string | null>(null)
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set())
  const lineId = useRef(0)
  const call = useCall()
  const { bindBotAudio } = call
  const [theme, setTheme] = useTheme()

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
      } else if (e.type === 'phone_confirmed') {
        setPhone(e.phone)
      } else if (e.type === 'appointment_booked' || e.type === 'appointment_cancelled') {
        const a = e.appointment
        const booked = e.type === 'appointment_booked'
        setCallAppt(a)
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

  const callError = call.state === 'idle' ? call.error : null // while the phone is open it shows the error itself

  const startCall = () => {
    setLines([])
    setPhone(null)
    setCallAppt(null)
    unlockTones()
    call.start()
  }

  return (
    <div className={`app${call.state === 'idle' ? '' : ' app--sheet'}`}>
      <header className="topbar">
        <h1 className="wordmark">Sunrise Clinic</h1>
        <Clock />
        <span className={`pill pill--${call.state}`}>
          <span className="pill__dot" />
          {STATE_LABEL[call.state]}
        </span>
        <div className="segmented" role="group" aria-label="Theme">
          {(['paper', 'ink'] as const).map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
              {t === 'paper' ? 'Paper' : 'Ink'}
            </button>
          ))}
        </div>
        <button className="btn btn--start" onClick={startCall} disabled={call.state !== 'idle'}>
          <Icon name="call" />
          Try Call
        </button>
      </header>

      {(backendDown || callError) && (
        <div className="banners" role="status">
          {backendDown && (
            <p className="banner">
              {link === 'reconnecting'
                ? 'Backend unreachable. Reconnecting…'
                : 'Backend unreachable. Start backend/bot.py.'}
            </p>
          )}
          {callError === 'mic-denied' && (
            <p className="banner">Microphone blocked. Allow it for this site and try again.</p>
          )}
          {callError === 'unreachable' && <p className="banner">Couldn't connect the call. Is the backend running?</p>}
        </div>
      )}

      <main className="board">
        {doctors && appointments && <Figures doctors={doctors} appointments={appointments} />}
        {doctors ? (
          <Schedule doctors={doctors} day={day} onDay={setDay} flashing={flashing} />
        ) : (
          <Pending title="Doctors" down={backendDown} />
        )}
        <div className="board__row">
          <Transcript lines={lines} phone={phone} />
          {appointments ? (
            <Ledger appointments={appointments} flashing={flashing} />
          ) : (
            <Pending title="Appointments" down={backendDown} />
          )}
        </div>
      </main>

      {/* Stays mounted so the bot's audio keeps playing whatever the call sheet does. */}
      <audio ref={bindBotAudio} autoPlay />
      <Phone call={call} lines={lines} phone={phone} appt={callAppt} />
    </div>
  )
}

/** A panel whose data hasn't arrived: still loading, or the backend is down. */
function Pending({ title, down }: { title: string; down: boolean }) {
  return (
    <section className="panel">
      <header className="section-head">
        <h2>{title}</h2>
      </header>
      <p className="empty">{down ? 'Unavailable.' : 'Loading…'}</p>
    </section>
  )
}
