import { slotKey, type Doctor } from '../api'
import { dayOfMonth, formatTime, hourLabel, minutes, today, weekday } from '../format'
import { useNow } from '../useNow'
import { Empty } from './Empty'

type Props = {
  doctors: Doctor[]
  day: string | null
  onDay: (d: string) => void
  flashing: Set<string>
}

const SLOT_MIN = 30
const MIN_FREE_TODAY = 4 // fewer than this left today: open on the next day with free slots

/** "Dr. Ananya Sharma" -> "AS" */
const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s*/, '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

export function Schedule({ doctors, day, onDay, flashing }: Props) {
  const days = [...new Set(doctors.flatMap((d) => d.slots.map((s) => s.date)))].sort()
  const freeOn = (d: string) =>
    doctors.reduce((n, doc) => n + doc.slots.filter((s) => s.date === d && !s.is_booked).length, 0)
  // Until the user picks a day: today, unless it is nearly done, then the next day with free slots.
  const opening =
    freeOn(today()) >= MIN_FREE_TODAY ? today() : (days.find((d) => d > today() && freeOn(d) > 0) ?? days[0])
  const active = day && days.includes(day) ? day : opening

  // Clinic hours across the week, so every day shares one axis.
  const allTimes = doctors.flatMap((d) => d.slots.map((s) => minutes(s.time)))
  const dayStart = Math.floor(Math.min(...allTimes) / 60) * 60
  const dayEnd = Math.ceil((Math.max(...allTimes) + SLOT_MIN) / 60) * 60

  // Today: the hours already gone collapse into a narrow "Earlier" strip, so the open hours get the width.
  const clock = new Date(useNow(30_000)).toTimeString().slice(0, 5)
  const nowMin = minutes(clock)
  const isToday = active === today()
  const start = isToday ? Math.min(Math.max(dayStart, Math.floor(nowMin / 60) * 60), dayEnd - 60) : dayStart
  const collapsed = start > dayStart
  const span = dayEnd - start
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => start / 60 + i)
  const pos = (m: number) => ((m - start) / span) * 100
  const pastPct = isToday ? Math.min(100, Math.max(0, pos(nowMin))) : 0
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
                disabled={freeOn(d) === 0} // nothing left to book that day
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
        <Empty>No open slots.</Empty>
      ) : (
        // keyed by day: switching days fades the lanes in
        <div className={`timeline${span <= 4 * 60 ? ' timeline--roomy' : ''}`} key={active}>
          <div className="timeline__axis" aria-hidden="true">
            <span className="label">Doctor</span>
            <div className={`lane${collapsed ? ' lane--collapsed' : ''}`}>
              {collapsed && <span className="earlier earlier--label">Earlier</span>}
              <div className="timeline__track">
                {hours.map((h, i) => (
                  <span
                    key={h}
                    className={`tick-label num${i % 3 ? ' tick-label--minor' : ''}`}
                    style={{ left: `${pos(h * 60)}%` }}
                  >
                    {hourLabel(h)}
                  </span>
                ))}
                {nowAt && (
                  <span className="now-label num" style={{ left: nowAt }}>
                    {formatTime(clock)}
                  </span>
                )}
              </div>
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
                <div className={`lane${collapsed ? ' lane--collapsed' : ''}`}>
                  {collapsed && <span className="earlier" aria-hidden="true" />}
                  <div className="timeline__track">
                    {pastPct > 0 && <span className="past" style={{ width: `${pastPct}%` }} />}
                    {hours.map((h) => (
                      <span key={h} className="gridline" style={{ left: `${pos(h * 60)}%` }} />
                    ))}
                    {nowAt && <span className="now" style={{ left: nowAt }} />}
                    {slots.map((s) => {
                      const key = slotKey(doc.id, s.date, s.time)
                      return (
                        <span
                          key={key}
                          className={`slot${s.is_booked ? ' slot--booked' : ''}${flashing.has(key) ? ' flash' : ''}`}
                          style={{ left: `${pos(minutes(s.time))}%`, width: `${(SLOT_MIN / span) * 100}%` }}
                          data-tip={`${formatTime(s.time)} · ${s.is_booked ? 'Booked' : 'Free'}`}
                          aria-label={`${doc.name} ${formatTime(s.time)} ${s.is_booked ? 'booked' : 'free'}`}
                        >
                          <span className="slot__time num">{formatTime(s.time)}</span>
                        </span>
                      )
                    })}
                  </div>
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
