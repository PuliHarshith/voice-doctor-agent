import type { Doctor } from '../api'
import { dayOfMonth, weekday } from '../format'

/** Two small charts from the slots the dashboard already has; both move as bookings arrive. */
export function Charts({ doctors }: { doctors: Doctor[] }) {
  return (
    <div className="charts">
      <WeekChart doctors={doctors} />
      <LoadChart doctors={doctors} />
    </div>
  )
}

/** This week: one stacked column per day, booked (accent) under free (neutral). */
function WeekChart({ doctors }: { doctors: Doctor[] }) {
  const days = [...new Set(doctors.flatMap((d) => d.slots.map((s) => s.date)))].sort()
  const rows = days.map((date) => {
    const slots = doctors.flatMap((d) => d.slots.filter((s) => s.date === date))
    const booked = slots.filter((s) => s.is_booked).length
    return { date, booked, free: slots.length - booked }
  })
  const max = Math.max(1, ...rows.map((r) => r.booked + r.free))
  const busiest = rows.reduce((a, b) => (b.booked > a.booked ? b : a), rows[0])

  return (
    <section className="panel chart" aria-label="Slots this week">
      <header className="section-head">
        <h2>This week</h2>
        <span className="chart-key" aria-hidden="true">
          <span>
            <i className="key key--booked" /> Booked
          </span>
          <span>
            <i className="key key--free" /> Free
          </span>
        </span>
      </header>
      <div className="week">
        <span className="week__tick num" aria-hidden="true">
          {max}
        </span>
        <div className="week__plot">
          {rows.map((r) => (
            <div
              key={r.date}
              className="week__col"
              role="img"
              aria-label={`${weekday(r.date)} ${dayOfMonth(r.date)}: ${r.booked} booked, ${r.free} free`}
              data-tip={`${weekday(r.date)} ${dayOfMonth(r.date)} · ${r.booked} booked · ${r.free} free`}
            >
              {/* the busiest day carries its count; the rest are in the tooltip */}
              <span className="week__cap num">{r === busiest && r.booked > 0 ? r.booked : ''}</span>
              <span className="week__stack" style={{ height: `${((r.booked + r.free) / max) * 100}%` }}>
                {r.free > 0 && <span className="week__free" style={{ flexGrow: r.free }} />}
                {r.booked > 0 && <span className="week__booked" style={{ flexGrow: r.booked }} />}
              </span>
              <span className="week__day">
                <span className="label">{weekday(r.date)}</span>
                <span className="num">{dayOfMonth(r.date)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Doctor load: the share of each doctor's slots this week that are booked. One measure, one colour. */
function LoadChart({ doctors }: { doctors: Doctor[] }) {
  const rows = doctors.map((d) => {
    const booked = d.slots.filter((s) => s.is_booked).length
    return { id: d.id, name: d.name.replace(/^Dr\.?\s*/, ''), booked, total: d.slots.length }
  })

  return (
    <section className="panel chart" aria-label="Doctor load this week">
      <header className="section-head">
        <h2>Doctor load</h2>
        <span className="section-meta">share of this week's slots booked</span>
      </header>
      <ul className="load">
        {rows.map((r) => {
          const pct = r.total ? Math.round((r.booked / r.total) * 100) : 0
          return (
            <li key={r.id} className="load__row" data-tip={`${r.booked} of ${r.total} slots booked`}>
              <span className="load__name">{r.name}</span>
              <span className="load__track" aria-hidden="true">
                <span className="load__fill" style={{ width: `${Math.max(pct, r.booked ? 2 : 0)}%` }} />
              </span>
              <span className="load__pct num" aria-label={`${pct}% booked, ${r.booked} of ${r.total}`}>
                {pct}%
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
