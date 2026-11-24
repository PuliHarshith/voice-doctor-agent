import { useEffect, useState } from 'react'
import { formatPhone } from '../format'

const STEP_MS = 90
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** The confirmed number, typed out digit by digit, then a check mark. Render with key={phone} so a new
 * number starts again. Screen readers get the whole number at once. */
export function ReadBack({ phone }: { phone: string | null }) {
  if (!phone) return <span className="readback readback--empty num">—</span>
  return <Digits phone={phone} />
}

function Digits({ phone }: { phone: string }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? phone.length : 0))
  useEffect(() => {
    const id = setInterval(() => setShown((n) => Math.min(n + 1, phone.length)), STEP_MS)
    return () => clearInterval(id)
  }, [phone])

  return (
    <span className="readback num">
      <span className="sr-only">{formatPhone(phone)}</span>
      <span aria-hidden="true">
        {[...phone.slice(0, shown)].map((d, i) => (
          <span key={i}>
            {i === 5 && <span className="readback__gap" />}
            <span className="readback__digit">{d}</span>
          </span>
        ))}
      </span>
      {shown === phone.length && (
        <svg
          className="readback__check"
          viewBox="0 0 24 24"
          width="0.8em"
          height="0.8em"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  )
}
