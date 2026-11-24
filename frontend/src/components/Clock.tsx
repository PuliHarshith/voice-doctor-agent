import { clockTime, formatClock } from '../format'
import { useNow } from '../useNow'

/** Wall clock for the top bar, "14:05". */
export function Clock() {
  const now = useNow(10_000)
  return (
    <time className="clock num" dateTime={new Date(now).toISOString()}>
      {clockTime(new Date(now))}
    </time>
  )
}

/** Call timer, "04:07" since `since`. */
export function Timer({ since }: { since: number }) {
  const now = useNow(250)
  return <>{formatClock(Math.max(0, Math.floor((now - since) / 1000)))}</>
}
