import { useEffect, useState } from 'react'
import type { useCall } from '../useCall'
import { formatClock } from '../format'

type Call = ReturnType<typeof useCall>

const LABEL = { idle: 'Idle', connecting: 'Ringing', connected: 'Connected', ended: 'Ended' } as const

export function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return <>{formatClock(Math.max(0, Math.floor((now - since) / 1000)))}</>
}

/** Dashboard call card: state, timer and the Try Call button. The call itself runs in <Phone>. */
export function CallConsole({ call, onStart }: { call: Call; onStart: () => void }) {
  const { state, connectedAt, bindBotAudio } = call

  return (
    <section className="console" aria-label="Call">
      <div className="console__status">
        <span className={`state state--${state}`}>
          <span className="state__dot" />
          {LABEL[state]}
        </span>
        <span className="console__timer num">
          {state === 'connected' && connectedAt ? <Timer since={connectedAt} /> : '00:00'}
        </span>
      </div>

      <div className="console__actions">
        <button className="btn btn--start" onClick={onStart} disabled={state !== 'idle'}>
          Try Call
        </button>
      </div>

      {/* Stays mounted on the dashboard so the bot's audio keeps playing whatever the overlay does. */}
      <audio ref={bindBotAudio} autoPlay />
    </section>
  )
}
