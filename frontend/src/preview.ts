// Dev-only: localhost:5173/?preview shows the call sheet mid-call with a sample conversation, for README
// screenshots without placing a call. PREVIEW is false in production builds, so none of this ships.
import type { Appointment } from './api'
import type { Line } from './components/Transcript'
import { formatDate, formatTime } from './format'
import { RIBBON_H, RIBBON_W, type useCall } from './useCall'

export const PREVIEW = import.meta.env.DEV && new URLSearchParams(location.search).has('preview')

/** A still voice ribbon: a sine under a soft envelope, like Ava mid-sentence. */
const wave = (amp: number, freq: number) => {
  let d = `M0 ${RIBBON_H / 2}`
  for (let x = 4; x <= RIBBON_W; x += 4) {
    const env = Math.sin((Math.PI * x) / RIBBON_W)
    d += ` L${x} ${(RIBBON_H / 2 + Math.sin(x / freq) * amp * env).toFixed(1)}`
  }
  return d
}

export function previewCall(call: ReturnType<typeof useCall>, appt: Appointment) {
  const t = Date.now()
  const when = `${formatDate(appt.date)} at ${formatTime(appt.time)}`
  const said: [Line['role'], string][] = [
    ['assistant', 'Sunrise Clinic, this is Ava. How can I help?'],
    ['user', `I'd like to see ${appt.doctor} please.`],
    ['assistant', `Sure. ${appt.doctor} is free ${when}. Can I have your phone number?`],
    ['user', appt.phone.replace(/(\d{5})(\d{5})/, '$1 $2')],
    ['assistant', `That's ${appt.phone.split('').join(' ')}. Is that right?`],
    ['user', 'Yes.'],
    ['assistant', `Done. You're booked with ${appt.doctor} on ${when}.`],
  ]
  return {
    call: {
      ...call,
      state: 'connected' as const,
      activity: 'speaking' as const,
      connectedAt: t - 83_000,
      bindCallerMeter: (el: SVGPathElement | null) => void el?.setAttribute('d', wave(5, 7)),
      bindBotMeter: (el: SVGPathElement | null) => void el?.setAttribute('d', wave(18, 11)),
    },
    lines: said.map(([role, text], i) => ({ id: i, role, text, final: true, ts: t - (7 - i) * 9000 })),
    phone: appt.phone,
    appt,
    reply: 1.9,
  }
}
