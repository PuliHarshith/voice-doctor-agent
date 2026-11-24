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

export function Schedule({ doctors, day, onDay, flashing }: Props) {
  const days = [...new Set(doctors.flatMap((d) => d.slots.map((s) => s.date)))].sort()
  const active = day && days.includes(day) ? day : days[0]
  const daySlots = doctors.flatMap((d) => d.slots.filter((s) => s.date === active))

  // One shared axis for the day, so rows line up and shift gaps read at a glance.
  const startMin = Math.floor(Math.min(...daySlots.map((s) => minutes(s.time))) / 60) * 60
  const endMin = Math.ceil((Math.max(...daySlots.map((s) => minutes(s.time))) + SLOT_MIN) / 60) * 60
  const span = endMin - startMin
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => startMin / 60 + i)
  const pos = (hhmm: string) => ((minutes(hhmm) - startMin) / span) * 100

  // "now" marker: only on today's lanes, only while inside the day's hours; moves every 30 s.
  const clock = new Date(useNow(30_000)).toTimeString().slice(0, 5)
  const nowAt = active === today() && minutes(clock) >= startMin && minutes(clock) <= endMin ? `${pos(clock)}%` : null

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

      {daySlots.length === 0 ? (
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
                  <span className="row__name">{doc.name}</span>
                  <span className="row__spec">{doc.specialty}</span>
                </div>
                <div className="timeline__track">
                  {hours.map((h) => (
                    <span key={h} className="gridline" style={{ left: `${((h * 60 - startMin) / span) * 100}%` }} />
                  ))}
                  {slots.length === 0 && <span className="row__none">No hours left today</span>}
                  {nowAt && <span className="now" style={{ left: nowAt }} />}
                  {slots.map((s) => {
                    const key = slotKey(doc.id, s.date, s.time)
                    return (
                      <span
                        key={key}
                        className={`slot${s.is_booked ? ' slot--booked' : ''}${flashing.has(key) ? ' flash' : ''}`}
                        style={{ left: `${pos(s.time)}%`, width: `${(SLOT_MIN / span) * 100}%` }}
                        title={`${formatTime(s.time)} · ${s.is_booked ? 'Booked' : 'Free'}`}
                        aria-label={`${doc.name} ${formatTime(s.time)} ${s.is_booked ? 'booked' : 'free'}`}
                      />
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
