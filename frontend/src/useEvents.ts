import { useEffect, useRef, useState } from 'react'
import type { ServerEvent } from './api'

export type LinkState = 'connecting' | 'live' | 'reconnecting'

/**
 * Subscribes to /api/events. EventSource retries on its own at a fixed interval, so we close it on
 * error and reopen with exponential backoff (1s, 2s, 4s ... capped at 30s) instead.
 * onOpen fires on every (re)connect so the caller can refetch whatever it missed while offline.
 */
export function useEvents(onEvent: (e: ServerEvent) => void, onOpen: () => void): LinkState {
  const [link, setLink] = useState<LinkState>('connecting')
  const handlers = useRef({ onEvent, onOpen })
  useEffect(() => {
    handlers.current = { onEvent, onOpen }
  })

  useEffect(() => {
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let delay = 1000
    let stopped = false

    const open = () => {
      source = new EventSource('/api/events')
      source.onopen = () => {
        delay = 1000
        setLink('live')
        handlers.current.onOpen()
      }
      source.onmessage = (m) => {
        try {
          handlers.current.onEvent(JSON.parse(m.data) as ServerEvent)
        } catch (err) {
          console.error('Bad event from /api/events', m.data, err)
        }
      }
      source.onerror = () => {
        source?.close()
        if (stopped) return
        setLink('reconnecting')
        retry = setTimeout(open, delay)
        delay = Math.min(delay * 2, 30_000)
      }
    }

    open()
    return () => {
      stopped = true
      clearTimeout(retry)
      source?.close()
    }
  }, [])

  return link
}
