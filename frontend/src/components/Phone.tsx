import { useEffect, useRef, useState } from 'react'
import { FLAT, RIBBON_H, RIBBON_W, type useCall } from '../useCall'
import { Timer } from './Clock'
import { formatClock, formatDate, formatPhone, formatTime } from '../format'
import type { Appointment } from '../api'
import { hangUpTone, ring } from '../tones'
import { Icon } from './Icon'
import { ChatLines, type Line } from './Transcript'
import { ReadBack } from './ReadBack'

type Call = ReturnType<typeof useCall>

const LABEL = { idle: '', connecting: 'Ringing', connected: 'Connected', ended: 'Call ended' } as const
const ENDED_MS = 1600 // how long "Call ended" stays up before the screen fades back to the dashboard
const FADE_MS = 200 // matches .phone-layer transition
const ACTIVITY = { listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' } as const

type Props = { call: Call; lines: Line[]; phone: string | null; appt: Appointment | null; reply: number | null }

/** Phone-style call sheet: ringing -> connected -> ended. */
export function Phone({ call, lines, phone, appt, reply }: Props) {
  const {
    state,
    error,
    muted,
    activity,
    connectedAt,
    endedAt,
    end,
    toggleMute,
    dismiss,
    bindCallerMeter,
    bindBotMeter,
  } = call
  const [closing, setClosing] = useState(false)
  const endBtn = useRef<HTMLButtonElement>(null)

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

  if (state === 'idle') return null
  const live = state === 'connecting' || state === 'connected'

  return (
    <div className={`phone-layer${closing ? ' phone-layer--closing' : ''}`}>
      <section className={`phone phone--${state}`} role="dialog" aria-label="Call with Ava">
        {/* Hero: deep green with grain; the timer, the voice ribbon and the last reply time. */}
        <header className="phone__head hero">
          <div className="hero__top">
            <span>
              <span className="hero__org">Sunrise Clinic</span>
              <h2 className="hero__name">Ava</h2>
            </span>
            <span key={state} className={`state state--${state} hero__state`}>
              <span className="state__dot" />
              {LABEL[state]}
            </span>
          </div>
          <p className="hero__timer num">
            {state === 'connected' && connectedAt ? (
              <Timer since={connectedAt} />
            ) : connectedAt && endedAt ? (
              formatClock(Math.floor((endedAt - connectedAt) / 1000))
            ) : (
              '00:00'
            )}
          </p>
          <svg
            className={`ribbon${state === 'connected' ? '' : ' ribbon--off'}`}
            viewBox={`0 0 ${RIBBON_W} ${RIBBON_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* useCall redraws these paths every frame from the live audio; React only sets the start. */}
            <path className="ribbon__caller" ref={bindCallerMeter} d={FLAT} />
            <path className="ribbon__bot" ref={bindBotMeter} d={FLAT} />
          </svg>
          <div className="hero__meta">
            <span className="ribbon__key" aria-hidden="true">
              <span>
                <i />
                You
              </span>
              <span>
                <i className="is-bot" />
                Ava
              </span>
            </span>
            <span key={activity} className={`hero__activity hero__activity--${activity}`} aria-live="polite">
              {state === 'connected' ? ACTIVITY[activity] : ''}
            </span>
            <span className="hero__reply num" title="End of your speech to Ava's first word, last turn">
              reply <b>{reply === null ? '—' : `${reply.toFixed(1)} s`}</b>
            </span>
          </div>
        </header>
        {/* Always there, so nothing shifts when the number arrives. */}
        <div className="phone__caller" aria-label="Caller's confirmed number">
          <ReadBack key={phone} phone={phone} />
        </div>
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
                  <span className={`status status--${appt.status}`}>
                    {appt.status === 'booked' ? 'Booked' : 'Cancelled'}
                  </span>
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
                <ChatLines lines={lines} />
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
