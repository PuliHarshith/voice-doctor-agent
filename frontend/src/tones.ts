// Ring and hang-up tones, synthesised with Web Audio oscillators (no audio files).
let ctx: AudioContext | null = null

/** Call from the Try Call click: browsers only allow audio to start from a user gesture. */
export function unlockTones() {
  ctx ??= new AudioContext()
  void ctx.resume()
}

/** One soft tone (frequencies mixed) with short ramps so it doesn't click. Returns a stop function. */
function tone(freqs: number[], at: number, secs: number, peak = 0.04) {
  const c = ctx!
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + 0.03)
  gain.gain.setValueAtTime(peak, at + secs - 0.06)
  gain.gain.linearRampToValueAtTime(0, at + secs)
  gain.connect(c.destination)
  for (const f of freqs) {
    const osc = c.createOscillator()
    osc.frequency.value = f
    osc.connect(gain)
    osc.start(at)
    osc.stop(at + secs)
  }
  return () => gain.disconnect()
}

/** Double ring (400 + 450 Hz, the classic phone ring) every 3 s until the returned function is called. */
export function ring() {
  if (!ctx) return
  const stops: (() => void)[] = []
  const burst = () => {
    const t = ctx!.currentTime
    stops.push(tone([400, 450], t, 0.4), tone([400, 450], t + 0.6, 0.4))
  }
  burst()
  const timer = setInterval(burst, 3000)
  return () => {
    clearInterval(timer)
    stops.forEach((stop) => stop())
  }
}

/** Short falling two-note tone when the call ends. */
export function hangUpTone() {
  if (!ctx) return
  const t = ctx.currentTime
  tone([660], t, 0.16)
  tone([440], t + 0.18, 0.24)
}
