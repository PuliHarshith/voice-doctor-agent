import { useEffect, useState } from 'react'
import type { useCall } from '../useCall'
import { formatClock, formatPhone } from '../format'

type Call = ReturnType<typeof useCall>

export function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return <>{formatClock(Math.max(0, Math.floor((now - since) / 1000)))}</>
}

/** Top of the call panel: timer and, once the caller confirms the read-back, their number. */
export function CallConsole({ call, phone }: { call: Call; phone: string | null }) {
  const { state, connectedAt, bindBotAudio } = call

  return (
    <div className={`console console--${state}`}>
      <span className="console__timer num">
        {state === 'connected' && connectedAt ? <Timer since={connectedAt} /> : '00:00'}
      </span>
      <dl className="console__caller">
        <dt>Caller</dt>
        <dd className="num">{phone ? formatPhone(phone) : '—'}</dd>
      </dl>
      {/* Stays mounted on the dashboard so the bot's audio keeps playing whatever the overlay does. */}
      <audio ref={bindBotAudio} autoPlay />
    </div>
  )
}
