import { apptKey, type Appointment } from '../api'
import { formatDate, formatPhone, formatTime } from '../format'

export function Ledger({ appointments, flashing }: { appointments: Appointment[]; flashing: Set<string> }) {
  const live = appointments.filter((a) => a.status === 'booked').length

  return (
    <section className="panel ledger" aria-label="Appointments">
      <header className="section-head">
        <h2>Appointments</h2>
        <span className="section-meta num">{live} booked</span>
      </header>

      {appointments.length === 0 ? (
        <p className="empty">No appointments yet.</p>
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
              {appointments.map((a) => (
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
