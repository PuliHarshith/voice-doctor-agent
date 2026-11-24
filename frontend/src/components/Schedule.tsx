import { slotKey, type Doctor } from '../api'
import { dayOfMonth, formatTime, minutes, today, weekday } from '../format'
import { useNow } from '../useNow'

type Props = {
  doctors: Doctor[]
  day: string | null
  onDay: (d: string) => void
  flashing: Set<string>
}

const SLOT_MIN = 30

/** "Dr. Ananya Sharma" -> "AS" */
const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s*/, '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

/** "17:30" -> "5:30" (the axis already says am/pm) */
const shortTime = (hhmm: string) => formatTime(hhmm).replace(/\s?[AP]M$/, '')

export function Schedule({ doctors, day, onDay, flashing }: Props) {
  const days = [...new Set(doctors.flatMap((d) => d.slots.map((s) => s.date)))].sort()
  // Until the user picks a day: today, unless fewer than 3 slots are left, then the next day with free slots.
  const freeOn = (d: string) =>
    doctors.reduce((n, doc) => n + doc.slots.filter((s) => s.date === d && !s.is_booked).length, 0)
  const opening = freeOn(today()) >= 3 ? today() : (days.find((d) => d > today() && freeOn(d) > 0) ?? days[0])
  const active = day && days.includes(day) ? day : opening

  // One fixed axis for every day (opening to closing across the whole week), so a slot always has
  // its real width and late in the day the lanes don't stretch two slots across the screen.
  const allTimes = doctors.flatMap((d) => d.slots.map((s) => minutes(s.time)))
  const startMin = Math.floor(Math.min(...allTimes) / 60) * 60
  const endMin = Math.ceil((Math.max(...allTimes) + SLOT_MIN) / 60) * 60
  const span = endMin - startMin
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => startMin / 60 + i)
  const pos = (hhmm: string) => ((minutes(hhmm) - startMin) / span) * 100

  // Today: hours already gone are shaded, and a "now" marker sits at the edge; moves every 30 s.
  const clock = new Date(useNow(30_000)).toTimeString().slice(0, 5)
  const isToday = active === today()
  const pastPct = isToday ? Math.min(100, Math.max(0, pos(clock))) : 0
  const nowAt = isToday && pastPct > 0 && pastPct < 100 ? `${pastPct}%` : null

  return (
    <section className="panel schedule" aria-label="Doctors and slots">
      <header className="section-head">
        <h2>Doctors</h2>
        <span className="legend" aria-hidden="true">
          <span>
            <i className="slot slot--key" /> Free
          </span>
          <span>
            <i className="slot slot--key slot--booked" /> Booked
          </span>
          {isToday && (
            <span>
              <i className="past-key" /> Past
            </span>
          )}
        </span>
        <nav className="days" aria-label="Day">
          {days.map((d) => {
            const slots = doctors.flatMap((doc) => doc.slots.filter((s) => s.date === d))
            const booked = slots.filter((s) => s.is_booked).length
            return (
              <button
                key={d}
                className={`day${d === active ? ' day--active' : ''}`}
                onClick={() => onDay(d)}
                aria-pressed={d === active}
                title={`${slots.length - booked} free, ${booked} booked`}
              >
                <span className="day__wd">{weekday(d)}</span>
                <span className="day__num num">{dayOfMonth(d)}</span>
                <span className="day__n num">{booked || ''}</span>
              </button>
            )
          })}
        </nav>
      </header>

      {allTimes.length === 0 ? (
        <p className="empty">No open slots.</p>
      ) : (
        <div className="timeline">
          <div className="timeline__axis" aria-hidden="true">
            <span className="label">Doctor</span>
            <div className="timeline__track">
              {hours.map((h) => (
                <span key={h} className="tick-label num" style={{ left: `${((h * 60 - startMin) / span) * 100}%` }}>
                  {h > 12 ? h - 12 : h}
                  {h >= 12 ? 'p' : 'a'}
                </span>
              ))}
              {nowAt && (
                <span className="now-label num" style={{ left: nowAt }}>
                  {clock}
                </span>
              )}
            </div>
            <span className="label lane-free">Free</span>
          </div>

          {doctors.map((doc) => {
            const slots = doc.slots.filter((s) => s.date === active)
            const free = slots.filter((s) => !s.is_booked).length
            return (
              <div className="row" key={doc.id}>
                <div className="row__who">
                  <span className="mono" aria-hidden="true">
                    {initials(doc.name)}
                  </span>
                  <span className="row__names">
                    <span className="row__name">{doc.name}</span>
                    <span className="row__spec">{doc.specialty}</span>
                  </span>
                </div>
                <div className="timeline__track">
                  {pastPct > 0 && <span className="past" style={{ width: `${pastPct}%` }} />}
                  {hours.map((h) => (
                    <span key={h} className="gridline" style={{ left: `${((h * 60 - startMin) / span) * 100}%` }} />
                  ))}
                  {nowAt && <span className="now" style={{ left: nowAt }} />}
                  {slots.map((s) => {
                    const key = slotKey(doc.id, s.date, s.time)
                    return (
                      <span
                        key={key}
                        className={`slot${s.is_booked ? ' slot--booked' : ''}${flashing.has(key) ? ' flash' : ''}`}
                        style={{ left: `${pos(s.time)}%`, width: `${(SLOT_MIN / span) * 100}%` }}
                        data-tip={`${formatTime(s.time)} · ${s.is_booked ? 'Booked' : 'Free'}`}
                        aria-label={`${doc.name} ${formatTime(s.time)} ${s.is_booked ? 'booked' : 'free'}`}
                      >
                        {s.is_booked && <span className="slot__time num">{shortTime(s.time)}</span>}
                      </span>
                    )
                  })}
                </div>
                <span className="row__count num" title="Free slots">
                  {free}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
