import { useCallback, useEffect, useRef, useState } from 'react'
import { DeviceError, PipecatClient } from '@pipecat-ai/client-js'
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport'
import Daily from '@daily-co/daily-js'
import { postCallState } from './api'

export type CallState = 'idle' | 'connecting' | 'connected' | 'ended'
export type CallError = 'mic-denied' | 'unreachable' | null
export type Activity = 'listening' | 'thinking' | 'speaking'

const setLevel = (el: HTMLDivElement | null, level: number) =>
  el?.style.setProperty('--level', Math.min(1, level * 5).toFixed(3))

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
  const callerMeter = useRef<HTMLDivElement | null>(null)
  const botMeter = useRef<HTMLDivElement | null>(null)

  const audioCtx = useRef<AudioContext | null>(null)
  const stopMeters = useRef<(() => void)[]>([])

  /** RMS level of a WebRTC audio track, read every animation frame with a Web Audio analyser.
   * (SmallWebRTCTransport never emits onRemoteAudioLevel for WebRTC tracks, so we measure ourselves.) */
  const meterTrack = useCallback((track: MediaStreamTrack, target: { current: HTMLDivElement | null }) => {
    const ctx = (audioCtx.current ??= new AudioContext())
    const source = ctx.createMediaStreamSource(new MediaStream([track]))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    let frame = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      setLevel(target.current, Math.sqrt(sum / buf.length))
      frame = requestAnimationFrame(tick)
    }
    tick()
    stopMeters.current.push(() => {
      cancelAnimationFrame(frame)
      source.disconnect()
      setLevel(target.current, 0)
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
          if (participant?.local) return meterTrack(track, callerMeter) // muting disables the track -> level 0
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
  const bindCallerMeter = useCallback((el: HTMLDivElement | null) => void (callerMeter.current = el), [])
  const bindBotMeter = useCallback((el: HTMLDivElement | null) => void (botMeter.current = el), [])

  return { state, error, muted, activity, connectedAt, endedAt, start, end, toggleMute, dismiss, bindBotAudio, bindCallerMeter, bindBotMeter }
}
