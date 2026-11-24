// Shapes returned by backend/api.py and published by backend/events.py.

export type Slot = { date: string; time: string; is_booked: boolean } // date YYYY-MM-DD, time HH:MM (24h)

export type Doctor = { id: number; name: string; specialty: string; slots: Slot[] }

export type Appointment = {
  id: number
  phone: string
  doctor_id: number
  doctor: string
  specialty: string
  date: string
  time: string
  status: 'booked' | 'cancelled'
  created_at: string
}

export type ServerEvent =
  | { type: 'call_status'; status: 'idle' | 'ringing' | 'connected' | 'ended'; ts: number }
  | { type: 'transcript'; role: 'user' | 'assistant'; text: string; final: boolean; ts: number }
  | { type: 'appointment_booked'; appointment: Appointment; ts: number }
  | { type: 'appointment_cancelled'; appointment: Appointment; ts: number }
  | { type: 'slots_changed'; doctor_id: number; date: string; ts: number }
  | { type: 'phone_confirmed'; phone: string; ts: number }
  | { type: 'reply_timing'; seconds: number; ts: number } // end of caller's speech -> Ava's first audio

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/** Fire-and-forget call-state ping for the dashboard; the call itself never depends on it. */
export function postCallState(which: 'start' | 'end') {
  fetch(`/api/call/${which}`, { method: 'POST' }).catch(() => {})
}

/** Identity keys used to flash the exact slot / ledger row that changed. */
export const slotKey = (doctorId: number, date: string, time: string) => `slot:${doctorId}|${date}|${time}`
export const apptKey = (id: number) => `appt:${id}`
