import { useEffect, useRef } from 'react'

export type Line = { id: number; role: 'user' | 'assistant'; text: string; final: boolean }

export function Transcript({ lines }: { lines: Line[] }) {
  const box = useRef<HTMLOListElement>(null)
  const last = lines[lines.length - 1]

  // Follow the newest utterance, including in-place updates of a line still being spoken.
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [lines.length, last?.text])

  return (
    <section className="transcript" aria-label="Transcript">
      <header className="section-head">
        <h2>Transcript</h2>
      </header>
      {lines.length === 0 ? (
        <p className="empty">No conversation yet.</p>
      ) : (
        <ol className="transcript__lines" ref={box} aria-live="polite">
          {lines.map((l) => (
            <li key={l.id} className={`utt utt--${l.role}${l.final ? '' : ' utt--partial'}`}>
              <span className="utt__who">{l.role === 'user' ? 'Caller' : 'Ava'}</span>
              <p className="utt__text">{l.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
