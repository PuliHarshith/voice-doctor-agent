import type { Appointment, Doctor } from '../api'
import { formatTime, today, weekday } from '../format'
import { useNow } from '../useNow'

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA')

/** Three counts and the next visit, each with one line of context. Counted from the data, nothing estimated. */
export function Figures({ doctors, appointments }: { doctors: Doctor[]; appointments: Appointment[] }) {
  const d = today()
  const weekEnd = inDays(7)
  const todaySlots = doctors.flatMap((doc) => doc.slots.filter((s) => s.date === d))
  const thisWeek = appointments.filter((a) => a.date >= d && a.date < weekEnd)
  const booked = appointments.filter((a) => a.status === 'booked')
  const now = useNow(30_000) // the next visit and its countdown move on as the clock passes
  const next = booked
    .map((a) => ({ a, at: new Date(`${a.date}T${a.time}`).getTime() }))
    .filter((x) => x.at > now)
    .sort((x, y) => x.at - y.at)[0]

  const figures = [
    ['Booked today', booked.filter((a) => a.date === d).length, `${booked.filter((a) => a.date >= d).length} upcoming`],
    ['Free slots today', todaySlots.filter((s) => !s.is_booked).length, `of ${todaySlots.length} remaining`],
    ['Cancelled this week', thisWeek.filter((a) => a.status === 'cancelled').length, `of ${thisWeek.length} this week`],
    next
      ? ['Next appointment', formatTime(next.a.time), `${surname(next.a.doctor)} · ${when(next.a.date, next.at - now)}`]
      : ['Next appointment', '–', 'nothing booked'],
  ] as const

  return (
    <section className="figures" aria-label="Today and this week">
      {figures.map(([label, value, context]) => (
        <div key={label} className="figure">
          <span className="label">{label}</span>
          <span className="figure__value num">
            {String(value).split(' ')[0]}
            {/* "9:00 AM": the AM/PM is set small so the time stays on one line beside the call sheet */}
            {String(value).includes(' ') && <small className="figure__unit">{String(value).split(' ')[1]}</small>}
          </span>
          <span className="figure__context num">{context}</span>
        </div>
      ))}
    </section>
  )
}

const surname = (doctor: string) => `Dr. ${doctor.split(' ').pop()}`

/** "in 25 min", "in 2 h 5 min" today; "tomorrow"; the weekday after that. */
function when(date: string, ms: number) {
  if (date === inDays(1)) return 'tomorrow'
  if (date !== today()) return weekday(date)
  const m = Math.ceil(ms / 60_000)
  return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
}
