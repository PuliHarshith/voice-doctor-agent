const parseDate = (iso: string) => new Date(`${iso}T00:00:00`)

/** "9703065715" -> "97030 65715" (how Indian mobile numbers are usually grouped) */
export const formatPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p)

/** "15:00" -> "3:00 PM" */
export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "2026-11-25" -> "Wed 25 Nov" */
export const formatDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export const weekday = (iso: string) => parseDate(iso).toLocaleDateString('en-GB', { weekday: 'short' })
export const dayOfMonth = (iso: string) => parseDate(iso).getDate()

/** seconds -> "04:07" */
export const formatClock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
