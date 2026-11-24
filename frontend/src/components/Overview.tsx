import type { Appointment, Doctor } from '../api'
import { formatDate, formatPhone, formatTime } from '../format'

// Local "today" as YYYY-MM-DD and "now" as HH:MM: same clock as the backend (it runs on this machine).
const today = () => new Date().toLocaleDateString('en-CA')
const nowHHMM = () => new Date().toTimeString().slice(0, 5)

const upcoming = (appointments: Appointment[]) => {
  const [d, t] = [today(), nowHHMM()]
  return appointments
    .filter((a) => a.status === 'booked' && (a.date > d || (a.date === d && a.time > t)))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
}

/** Four figures over the day's work. Counts only: nothing here is estimated. */
export function Figures({ doctors, appointments }: { doctors: Doctor[]; appointments: Appointment[] }) {
  const d = today()
  const figures = [
    ['Booked today', appointments.filter((a) => a.status === 'booked' && a.date === d).length],
    ['Upcoming', upcoming(appointments).length],
    ['Free slots today', doctors.reduce((n, doc) => n + doc.slots.filter((s) => s.date === d && !s.is_booked).length, 0)],
    ['Cancelled', appointments.filter((a) => a.status === 'cancelled').length],
  ] as const

  return (
    <section className="figures" aria-label="Today at a glance">
      {figures.map(([label, value]) => (
        <div key={label} className="figure">
          <span className="figure__label">{label}</span>
          <span className="figure__value num">{value}</span>
        </div>
      ))}
    </section>
  )
}

/** The next three booked appointments, then bookings per doctor. */
export function Aside({ doctors, appointments }: { doctors: Doctor[]; appointments: Appointment[] }) {
  const next = upcoming(appointments)
  const perDoctor = doctors.map((doc) => ({ doc, n: next.filter((a) => a.doctor_id === doc.id).length }))
  const max = Math.max(1, ...perDoctor.map((p) => p.n))

  return (
    <aside className="aside">
      <section aria-label="Up next">
        <header className="section-head">
          <h2>Up next</h2>
        </header>
        {next.length === 0 ? (
          <p className="empty">Nothing booked.</p>
        ) : (
          <ol className="next">
            {next.slice(0, 3).map((a) => (
              <li key={a.id} className="next__item">
                <span className="next__time num">{formatTime(a.time)}</span>
                <span className="next__who">
                  {a.doctor}
                  <span className="cell-sub num">
                    {formatDate(a.date)} · {formatPhone(a.phone)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Upcoming bookings by doctor">
        <header className="section-head">
          <h2>By doctor</h2>
        </header>
        <ul className="bars">
          {perDoctor.map(({ doc, n }) => (
            <li key={doc.id} className="bar">
              <span className="bar__name">{doc.name.replace('Dr. ', '')}</span>
              <span className="bar__track" aria-hidden="true">
                <span className="bar__fill" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="bar__n num">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
