import type { Appointment, Doctor } from '../api'
import { today } from '../format'

/** Three counts for today, each with one line of context. Counted from the data, nothing estimated. */
export function Figures({ doctors, appointments }: { doctors: Doctor[]; appointments: Appointment[] }) {
  const d = today()
  const todaySlots = doctors.flatMap((doc) => doc.slots.filter((s) => s.date === d))
  const booked = appointments.filter((a) => a.status === 'booked')
  const cancelled = appointments.filter((a) => a.status === 'cancelled')

  const figures = [
    ['Booked today', booked.filter((a) => a.date === d).length, `${booked.filter((a) => a.date >= d).length} upcoming`],
    ['Free slots', todaySlots.filter((s) => !s.is_booked).length, `of ${todaySlots.length} left today`],
    ['Cancelled today', cancelled.filter((a) => a.date === d).length, `${cancelled.length} in all`],
  ] as const

  return (
    <section className="figures" aria-label="Today">
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
