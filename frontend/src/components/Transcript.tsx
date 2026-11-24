import { useEffect, useRef } from 'react'
import { ReadBack } from './ReadBack'
import { Empty } from './Empty'

/** ts: when the line started, ms since epoch (from the server event). */
export type Line = { id: number; role: 'user' | 'assistant'; text: string; final: boolean; ts: number }

const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-GB')

/** Transcript widget on the board: the confirmed number on top, the conversation below. */
export function Transcript({ lines, phone }: { lines: Line[]; phone: string | null }) {
  return (
    <section className="panel chat" aria-label="Transcript">
      <header className="section-head">
        <h2>Transcript</h2>
      </header>
      {/* the caller block appears with the conversation, not before */}
      {(lines.length > 0 || phone) && (
        <div className="chat__number">
          <span className="label">Caller</span>
          <ReadBack key={phone} phone={phone} />
        </div>
      )}
      {lines.length === 0 ? <Empty>No conversation yet.</Empty> : <ChatLines lines={lines} />}
    </section>
  )
}

/** Chat bubbles, caller left and Ava right, following the newest line (also used in the call sheet). */
export function ChatLines({ lines }: { lines: Line[] }) {
  const box = useRef<HTMLOListElement>(null)
  const last = lines[lines.length - 1]

  // Follow the newest utterance, including in-place updates of a line still being spoken.
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [lines.length, last?.text])

  return (
    <ol className="chat__lines" ref={box} aria-live="polite">
      {lines.map((l) => (
        <li key={l.id} className={`bubble bubble--${l.role}${l.final ? '' : ' bubble--partial'}`}>
          <span className="sr-only">{l.role === 'user' ? 'Caller' : 'Ava'}:</span>
          <p className="bubble__text">{l.text}</p>
          <time className="bubble__time num">{clock(l.ts)}</time>
        </li>
      ))}
    </ol>
  )
}
