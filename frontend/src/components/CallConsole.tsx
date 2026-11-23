import { useEffect, useState } from 'react'
import type { useCall } from '../useCall'
import { formatClock } from '../format'

type Call = ReturnType<typeof useCall>

const LABEL = { idle: 'Idle', connecting: 'Connecting', connected: 'Connected', ended: 'Ended' } as const

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return <>{formatClock(Math.max(0, Math.floor((now - since) / 1000)))}</>
}

function Meter({ label, bind, off }: { label: string; bind: Call['bindCallerMeter']; off?: boolean }) {
  return (
    <div className={`meter${off ? ' meter--off' : ''}`} ref={bind} aria-hidden="true">
      <span className="meter__label">{label}</span>
      <span className="meter__bars">
        <i /><i /><i /><i /><i /><i /><i />
      </span>
    </div>
  )
}

export function CallConsole({ call, onStart }: { call: Call; onStart: () => void }) {
  const { state, muted, connectedAt, end, toggleMute, bindBotAudio, bindCallerMeter, bindBotMeter } = call
  const live = state === 'connecting' || state === 'connected'

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

      <div className="console__meters">
        <Meter label="Caller" bind={bindCallerMeter} off={!live || muted} />
        <Meter label="Ava" bind={bindBotMeter} off={!live} />
      </div>

      <div className="console__actions">
        {live ? (
          <>
            <button className="btn btn--end" onClick={end}>
              End call
            </button>
            <button
              className="btn btn--quiet"
              onClick={toggleMute}
              disabled={state !== 'connected'}
              aria-pressed={muted}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </>
        ) : (
          <button className="btn btn--start" onClick={onStart}>
            Start call
          </button>
        )}
      </div>

      <audio ref={bindBotAudio} autoPlay />
    </section>
  )
}
