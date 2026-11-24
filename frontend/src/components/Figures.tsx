import type { Appointment, Doctor } from '../api'
import { today } from '../format'

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA')

/** Three counts, each with one line of context. Counted from the data, nothing estimated. */
export function Figures({ doctors, appointments }: { doctors: Doctor[]; appointments: Appointment[] }) {
  const d = today()
  const weekEnd = inDays(7)
  const todaySlots = doctors.flatMap((doc) => doc.slots.filter((s) => s.date === d))
  const thisWeek = appointments.filter((a) => a.date >= d && a.date < weekEnd)
  const booked = appointments.filter((a) => a.status === 'booked')

  const figures = [
    ['Booked today', booked.filter((a) => a.date === d).length, `${booked.filter((a) => a.date >= d).length} upcoming`],
    ['Free slots today', todaySlots.filter((s) => !s.is_booked).length, `of ${todaySlots.length} remaining`],
    ['Cancelled this week', thisWeek.filter((a) => a.status === 'cancelled').length, `of ${thisWeek.length} this week`],
  ] as const

  return (
    <section className="figures" aria-label="Today and this week">
      {figures.map(([label, value, context]) => (
        <div key={label} className="figure">
          <span className="label">{label}</span>
          <span className="figure__value num">{value}</span>
          <span className="figure__context num">{context}</span>
        </div>
      ))}
    </section>
  )
}
