import { useState } from 'react'
import { apptKey, type Appointment } from '../api'
import { formatDate, formatPhone, formatTime } from '../format'
import { Empty } from './Empty'

export function Ledger({ appointments, flashing }: { appointments: Appointment[]; flashing: Set<string> }) {
  const [query, setQuery] = useState('')
  const live = appointments.filter((a) => a.status === 'booked').length
  const shown = appointments.filter((a) => matches(a, query))

  return (
    <section className="panel ledger" aria-label="Appointments">
      <header className="section-head">
        <h2>Appointments</h2>
        <input
          type="search"
          className="search"
          placeholder="Search phone or doctor"
          aria-label="Search appointments by patient phone or doctor"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="section-meta num" aria-live="polite">
          {query.trim() ? `${shown.length} found` : `${live} booked`}
        </span>
      </header>

      {appointments.length === 0 ? (
        <Empty>No appointments yet.</Empty>
      ) : shown.length === 0 ? (
        <Empty>No appointments match "{query.trim()}"</Empty>
      ) : (
        <div className="ledger__scroll">
          <table>
            <thead>
              <tr>
                <th>Patient phone</th>
                <th>Doctor</th>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr
                  key={a.id}
                  className={`${a.status === 'cancelled' ? 'is-cancelled' : ''}${flashing.has(apptKey(a.id)) ? ' flash' : ''}`}
                >
                  <td className="num">{formatPhone(a.phone)}</td>
                  <td>
                    {a.doctor}
                    <span className="cell-sub">{a.specialty}</span>
                  </td>
                  <td className="num">
                    {formatDate(a.date)}
                    <span className="cell-sub only-narrow">{formatTime(a.time)}</span>
                  </td>
                  <td className="num">{formatTime(a.time)}</td>
                  <td>
                    <span className={`status status--${a.status}`}>
                      {a.status === 'booked' ? 'Booked' : 'Cancelled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** A patient is their phone number, so digits match the number (spaces ignored); words match the doctor or specialty. */
function matches(a: Appointment, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  if (digits && digits.length === q.replace(/[\s+-]/g, '').length) return a.phone.includes(digits)
  return `${a.doctor} ${a.specialty}`.toLowerCase().includes(q)
}
