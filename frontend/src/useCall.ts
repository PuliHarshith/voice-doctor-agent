import { useCallback, useEffect, useRef, useState } from 'react'
import { DeviceError, PipecatClient } from '@pipecat-ai/client-js'
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport'
import Daily from '@daily-co/daily-js'
import { postCallState } from './api'

export type CallState = 'idle' | 'connecting' | 'connected' | 'ended'
export type CallError = 'mic-denied' | 'unreachable' | null
export type Activity = 'listening' | 'thinking' | 'speaking'

// Voice ribbon geometry, in the SVG's viewBox units (see Phone.tsx).
export const RIBBON_W = 300
export const RIBBON_H = 56
const POINTS = 48
const GAIN = 3 // speech rarely passes 0.3 of full scale; this fills the ribbon without clipping often
export const FLAT = `M0 ${RIBBON_H / 2} L${RIBBON_W} ${RIBBON_H / 2}`

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const EASE = 0.35 // each frame moves this far toward the new shape: the ribbon flows instead of jittering
const lastY = new WeakMap<SVGPathElement, number[]>()

/** Draw a slice of the waveform as one smooth line. A sine envelope pins both ends to the middle, so
 * it reads as a ribbon rather than a raw oscilloscope; quadratic curves through midpoints smooth it. */
function drawRibbon(path: SVGPathElement | null, buf: Float32Array | null) {
  if (!path) return
  if (!buf || reduceMotion()) {
    lastY.delete(path)
    return path.setAttribute('d', FLAT)
  }
  const mid = RIBBON_H / 2
  const prev = lastY.get(path)
  const pts = Array.from({ length: POINTS + 1 }, (_, i) => {
    const v = Math.max(-1, Math.min(1, buf[Math.floor((i * (buf.length - 1)) / POINTS)] * GAIN))
    const target = mid + v * Math.sin((Math.PI * i) / POINTS) * (mid - 2)
    const y = prev ? prev[i] + (target - prev[i]) * EASE : target
    return [(i * RIBBON_W) / POINTS, y]
  })
  lastY.set(path, pts.map(([, y]) => y))
  let d = `M${pts[0][0]} ${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    d += ` Q${x0} ${y0.toFixed(1)} ${(x0 + x1) / 2} ${((y0 + y1) / 2).toFixed(1)}`
  }
  path.setAttribute('d', d)
}

const isMicDenied = (e: unknown) =>
  (e instanceof DeviceError && e.type === 'permissions') ||
  (e instanceof DOMException && e.name === 'NotAllowedError')

/**
 * One voice call to the Pipecat bot over SmallWebRTC.
 * startBotAndConnect POSTs /start, then the transport sends its offer to /sessions/{id}/api/offer.
 * Audio levels are written straight to a CSS variable on each meter element (every frame, no re-renders).
 */
export function useCall() {
  const [state, setState] = useState<CallState>('idle')
  const [error, setError] = useState<CallError>(null)
  const [muted, setMuted] = useState(false)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const [endedAt, setEndedAt] = useState<number | null>(null)
  const [activity, setActivity] = useState<Activity>('listening')
  const client = useRef<PipecatClient | null>(null)
  const botAudio = useRef<HTMLAudioElement | null>(null)
  const callerMeter = useRef<SVGPathElement | null>(null)
  const botMeter = useRef<SVGPathElement | null>(null)

  const audioCtx = useRef<AudioContext | null>(null)
  const stopMeters = useRef<(() => void)[]>([])

  /** Waveform of a WebRTC audio track, read every animation frame with a Web Audio analyser and drawn
   * straight onto an SVG path (no re-renders). SmallWebRTCTransport has no audio-level events for
   * WebRTC tracks, so we measure ourselves. */
  const meterTrack = useCallback((track: MediaStreamTrack, target: { current: SVGPathElement | null }) => {
    const ctx = (audioCtx.current ??= new AudioContext())
    const source = ctx.createMediaStreamSource(new MediaStream([track]))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    let frame = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      drawRibbon(target.current, buf)
      frame = requestAnimationFrame(tick)
    }
    tick()
    stopMeters.current.push(() => {
      cancelAnimationFrame(frame)
      source.disconnect()
      drawRibbon(target.current, null)
    })
  }, [])

  const finish = useCallback(() => {
    client.current = null
    setEndedAt(Date.now()) // connectedAt is kept, so the ended screen can show the call length
    setState((s) => (s === 'idle' ? s : 'ended'))
    stopMeters.current.forEach((stop) => stop())
    stopMeters.current = []
    audioCtx.current?.close().catch(() => {})
    audioCtx.current = null
  }, [])

  const start = useCallback(async () => {
    if (client.current) return
    setError(null)
    setMuted(false)
    setConnectedAt(null)
    setEndedAt(null)
    setActivity('listening')
    setState('connecting')
    postCallState('start')

    // The transport gets the mic through Daily's call object and reuses an existing one, so creating it
    // first is how the mic constraints get in: cancel the bot's own echo and room noise, level the volume.
    if (!Daily.getCallInstance())
      Daily.createCallObject({
        inputSettings: {
          audio: {
            settings: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          },
        },
      })

    const setActivityFor = (from: PipecatClient, a: Activity) => {
      if (client.current === from) setActivity(a)
    }
    const pc: PipecatClient = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      enableCam: false,
      callbacks: {
        onBotReady: () => {
          // An abandoned attempt (mic blocked, or ended while ringing) can still finish connecting: hang it up.
          if (client.current !== pc) return void pc.disconnect().catch(() => {})
          setConnectedAt(Date.now())
          setState('connected')
        },
        // RTVI events from the bot's pipeline (its VAD and TTS), not guessed from audio levels.
        onUserStartedSpeaking: () => setActivityFor(pc, 'listening'),
        onUserStoppedSpeaking: () => setActivityFor(pc, 'thinking'),
        onBotStartedSpeaking: () => setActivityFor(pc, 'speaking'),
        onBotStoppedSpeaking: () => setActivityFor(pc, 'listening'),
        onDisconnected: () => {
          if (client.current !== pc) return // already finished; don't end a newer call
          postCallState('end')
          finish()
        },
        onTrackStarted: (track, participant) => {
          if (track.kind !== 'audio' || client.current !== pc) return
          if (participant?.local) return meterTrack(track, callerMeter) // muting disables the track -> flat line
          if (botAudio.current) {
            botAudio.current.srcObject = new MediaStream([track])
            botAudio.current.play().catch(() => {}) // autoplay is allowed: the call starts from a click
          }
          meterTrack(track, botMeter)
        },
        onDeviceError: (e) => {
          if (!isMicDenied(e)) return
          // A blocked mic is reported here, not thrown, and the connect would carry on with no
          // audio: stop the attempt instead of sitting in "Connecting".
          micDenied = true
          setError('mic-denied')
          postCallState('end')
          pc.disconnect().catch(() => {})
          finish()
        },
      },
    })
    let micDenied = false
    client.current = pc

    try {
      await pc.startBotAndConnect({ endpoint: '/start', requestData: { transport: 'webrtc' } })
    } catch (e) {
      console.error('Call failed to start', e)
      setError(micDenied || isMicDenied(e) ? 'mic-denied' : 'unreachable')
      postCallState('end')
      await pc.disconnect().catch(() => {})
      finish()
    }
  }, [finish, meterTrack])

  const end = useCallback(async () => {
    const pc = client.current
    if (!pc) return
    postCallState('end')
    await pc.disconnect().catch(() => {})
    finish()
  }, [finish])

  const toggleMute = useCallback(() => {
    const pc = client.current
    if (!pc) return
    pc.enableMic(muted) // currently muted -> enable
    setMuted(!muted)
  }, [muted])

  /** Back to the dashboard once the call screen has shown "ended". */
  const dismiss = useCallback(() => setState((s) => (s === 'ended' ? 'idle' : s)), [])

  // Hang up if the tab is closed mid-call, so the bot session ends too.
  useEffect(() => () => void client.current?.disconnect(), [])

  // Callback refs, so components attach elements without reading ref objects during render.
  const bindBotAudio = useCallback((el: HTMLAudioElement | null) => void (botAudio.current = el), [])
  const bindCallerMeter = useCallback((el: SVGPathElement | null) => void (callerMeter.current = el), [])
  const bindBotMeter = useCallback((el: SVGPathElement | null) => void (botMeter.current = el), [])

  return { state, error, muted, activity, connectedAt, endedAt, start, end, toggleMute, dismiss, bindBotAudio, bindCallerMeter, bindBotMeter }
}
