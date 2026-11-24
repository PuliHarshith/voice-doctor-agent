import { today } from './format'

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

/** The GitHub Pages build: a read-only dashboard over a bundled snapshot, with no backend and no calls. */
export const DEMO = import.meta.env.VITE_DEMO === '1'

/** Loads demo.json and moves its dates by whole days, so the snapshot's "today" is today here. */
export async function loadDemo() {
  type Snapshot = { today: string; doctors: Doctor[]; appointments: Appointment[] }
  const snap = await getJSON<Snapshot>(`${import.meta.env.BASE_URL}demo.json`)
  const DAY = 86_400_000
  const shift = Math.round((Date.parse(today()) - Date.parse(snap.today)) / DAY)
  const move = (iso: string) => new Date(Date.parse(iso) + shift * DAY).toISOString().slice(0, 10)
  return {
    doctors: snap.doctors.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s, date: move(s.date) })) })),
    appointments: snap.appointments.map((a) => ({ ...a, date: move(a.date) })),
  }
}
