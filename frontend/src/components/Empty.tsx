import type { ReactNode } from 'react'

/** A calm empty state: one line of copy over a faint ruler whose marker glides slowly. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="ruler" aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}
