import { useEffect, useRef, useState } from 'react'
import type { useCall } from '../useCall'
import { Timer } from './CallConsole'
import { formatClock, formatDate, formatPhone, formatTime } from '../format'
import type { Appointment } from '../api'
import { hangUpTone, ring } from '../tones'
import { Icon } from './Icon'
import type { Line } from './Transcript'

type Call = ReturnType<typeof useCall>

const LABEL = { idle: '', connecting: 'Ringing', connected: 'Connected', ended: 'Call ended' } as const
const ENDED_MS = 1600 // how long "Call ended" stays up before the screen fades back to the dashboard
const FADE_MS = 200 // matches .phone-layer transition
const ACTIVITY = { listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' } as const

/** Phone-style call screen over the dashboard: ringing -> connected -> ended. */
type Props = { call: Call; lines: Line[]; phone: string | null; appt: Appointment | null }

export function Phone({ call, lines, phone, appt }: Props) {
  const { state, error, muted, activity, connectedAt, endedAt, end, toggleMute, dismiss, bindCallerMeter, bindBotMeter } = call
  const [closing, setClosing] = useState(false)
  const box = useRef<HTMLOListElement>(null)
  const endBtn = useRef<HTMLButtonElement>(null)
  const last = lines[lines.length - 1]

  // Ended without an error: show it briefly, fade out, then back to the dashboard.
  // With an error the screen stays until closed, so the message can be read.
  useEffect(() => {
    if (state !== 'ended' || error) return
    const fade = setTimeout(() => setClosing(true), ENDED_MS)
    const close = setTimeout(() => {
      setClosing(false)
      dismiss()
    }, ENDED_MS + FADE_MS)
    return () => {
      clearTimeout(fade)
      clearTimeout(close)
    }
  }, [state, error, dismiss])

  useEffect(() => {
    if (state === 'connecting') endBtn.current?.focus()
  }, [state])

  useEffect(() => (state === 'connecting' ? ring() : undefined), [state]) // cleanup stops the ring
  useEffect(() => {
    if (state === 'ended' && !error) hangUpTone()
  }, [state, error])

  useEffect(() => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [lines.length, last?.text])

  if (state === 'idle') return null
  const live = state === 'connecting' || state === 'connected'

  return (
    <div className={`phone-layer${closing ? ' phone-layer--closing' : ''}`}>
      <section className={`phone phone--${state}`} role="dialog" aria-label="Call with Ava">
        <header className="phone__head">
          {/* Line is always there so nothing shifts when the number arrives. */}
          <p className="phone__caller num" aria-label="Caller's confirmed number">
            {phone && <span key={phone}>{formatPhone(phone)}</span>}
          </p>
          <p className="phone__org">Sunrise Clinic</p>
          <h2 className="phone__name">Ava</h2>
          <p className="phone__role">Receptionist</p>
          <div className="phone__status">
            <span key={state} className={`state state--${state} phone__state`}>
              <span className="state__dot" />
              {LABEL[state]}
            </span>
            <span className="phone__timer num">
              {state === 'connected' && connectedAt ? (
                <Timer since={connectedAt} />
              ) : connectedAt && endedAt ? (
                formatClock(Math.floor((endedAt - connectedAt) / 1000))
              ) : (
                '00:00'
              )}
            </span>
          </div>
          {state === 'connected' && (
            <p key={activity} className={`phone__activity phone__activity--${activity}`} aria-live="polite">
              {ACTIVITY[activity]}
            </p>
          )}
          <div className="phone__meters" aria-hidden="true">
            <Meter label="You" bind={bindCallerMeter} off={state !== 'connected' || muted} />
            <Meter label="Ava" bot bind={bindBotMeter} off={state !== 'connected'} />
          </div>
        </header>

        <div className="phone__body">
          {error === 'mic-denied' ? (
            <p className="phone__note">Microphone blocked. Allow it for this site and try again.</p>
          ) : error === 'unreachable' ? (
            <p className="phone__note">Couldn't connect. Is the backend running?</p>
          ) : (
            <>
              {appt && (
                <div
                  key={`${appt.id}-${appt.status}`}
                  className={`phone__card phone__card--${appt.status}`}
                  role="status"
                >
                  <span className={`status status--${appt.status}`}>{appt.status === 'booked' ? 'Booked' : 'Cancelled'}</span>
                  <p className="phone__card-doc">{appt.doctor}</p>
                  <p className="phone__card-when num">
                    {formatDate(appt.date)} · {formatTime(appt.time)}
                  </p>
                  <p className="phone__card-when num">{formatPhone(appt.phone)}</p>
                </div>
              )}
              {lines.length === 0 ? (
                <p className="phone__note">{state === 'connecting' ? 'Connecting to the front desk…' : 'Say hello.'}</p>
              ) : (
                <ol className="phone__lines" ref={box} aria-live="polite">
                  {lines.map((l) => (
                    <li key={l.id} className={`pl pl--${l.role}${l.final ? '' : ' pl--partial'}`}>
                      <span className="pl__who">{l.role === 'user' ? 'You' : 'Ava'}</span>
                      <p className="pl__text">{l.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>

        <footer className="phone__foot">
          {live ? (
            <>
              <button
                className="btn btn--quiet"
                onClick={toggleMute}
                disabled={state !== 'connected'}
                aria-pressed={muted}
              >
                <Icon name={muted ? 'muted' : 'mic'} />
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button className="btn btn--end" onClick={end} ref={endBtn}>
                <Icon name="end" />
                End call
              </button>
            </>
          ) : (
            error && (
              <button className="btn btn--quiet phone__close" onClick={dismiss}>
                Close
              </button>
            )
          )}
        </footer>
      </section>
    </div>
  )
}

type MeterProps = { label: string; bind: Call['bindCallerMeter']; off?: boolean; bot?: boolean }

function Meter({ label, bind, off, bot }: MeterProps) {
  return (
    <div className={`meter${bot ? ' meter--bot' : ''}${off ? ' meter--off' : ''}`} ref={bind}>
      <span className="meter__label">{label}</span>
      <span className="meter__bars">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
