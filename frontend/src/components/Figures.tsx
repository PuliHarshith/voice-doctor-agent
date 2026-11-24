import type { Appointment, Doctor } from '../api'
import { today } from '../format'

/** Three plain counts for today's schedule. Counted from the data, nothing estimated. */
export function Figures({ doctors, appointments }: { doctors: Doctor[]; appointments: Appointment[] }) {
  const d = today()
  const figures = [
    ['Booked today', appointments.filter((a) => a.date === d && a.status === 'booked').length],
    ['Free slots', doctors.reduce((n, doc) => n + doc.slots.filter((s) => s.date === d && !s.is_booked).length, 0)],
    ['Cancelled today', appointments.filter((a) => a.date === d && a.status === 'cancelled').length],
  ] as const

  return (
    <section className="figures" aria-label="Today">
      {figures.map(([label, value]) => (
        <div key={label} className="figure">
          <span className="label">{label}</span>
          <span className="figure__value num">{value}</span>
        </div>
      ))}
    </section>
  )
}
