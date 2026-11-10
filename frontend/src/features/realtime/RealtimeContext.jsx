import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/AuthContext'

const RealtimeContext = createContext(null)

function sameChannelForMessage(message) {
  if (message.type?.startsWith('dashboard.')) return 'admin.dashboard'
  const jobID = message.data?.job_id
  return jobID ? `job:${jobID}` : null
}

export function RealtimeProvider({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('idle')
  const socketRef = useRef(null)
  const subscriptionsRef = useRef(new Map())
  const revisionsRef = useRef(new Map())
  const lastEventRef = useRef(new Map())
  const reconnectRef = useRef(null)
  const attemptRef = useRef(0)
  const manualCloseRef = useRef(false)

  const send = useCallback((message) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  const connect = useCallback(() => {
    if (!user || socketRef.current) return
    manualCloseRef.current = false
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/v1/realtime`)
    socketRef.current = socket
    setStatus('connecting')

    socket.onopen = () => {
      attemptRef.current = 0
      setStatus('connected')
      for (const [channel] of subscriptionsRef.current) {
        send({ type: 'subscribe', channel, last_event_id: lastEventRef.current.get(channel) || 0 })
      }
    }
    socket.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message.type === 'connection.ready') return
      const channel = sameChannelForMessage(message)
      if (!channel) return
      const revision = Number(message.revision || 0)
      const previous = revisionsRef.current.get(channel) || 0
      if (revision > 0 && revision < previous) return
      if (revision > 0) revisionsRef.current.set(channel, revision)
      if (message.event_id) lastEventRef.current.set(channel, message.event_id)
      const handlers = subscriptionsRef.current.get(channel)
      if (!handlers) return
      for (const handler of handlers) handler(message)
    }
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null
      setStatus('disconnected')
      if (manualCloseRef.current || !user) return
      attemptRef.current += 1
      const backoff = Math.min(30000, 1000 * 2 ** Math.min(attemptRef.current, 5))
      const jitter = Math.floor(Math.random() * 500)
      reconnectRef.current = window.setTimeout(connect, backoff + jitter)
    }
    socket.onerror = () => socket.close()
  }, [send, user])

  useEffect(() => {
    if (!user) {
      manualCloseRef.current = true
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
      socketRef.current?.close()
      socketRef.current = null
      setStatus('idle')
      return undefined
    }
    connect()
    return () => {
      manualCloseRef.current = true
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [user, connect])

  const subscribe = useCallback((channel, handler) => {
    let handlers = subscriptionsRef.current.get(channel)
    if (!handlers) {
      handlers = new Set()
      subscriptionsRef.current.set(channel, handlers)
      send({ type: 'subscribe', channel, last_event_id: lastEventRef.current.get(channel) || 0 })
    }
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        subscriptionsRef.current.delete(channel)
        revisionsRef.current.delete(channel)
        send({ type: 'unsubscribe', channel })
      }
    }
  }, [send])

  return (
    <RealtimeContext.Provider value={{ status, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const context = useContext(RealtimeContext)
  return context || { status: 'idle', subscribe: () => () => {} }
}

export function useRealtimeChannel(channel, handler) {
  const { status, subscribe } = useRealtime()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!channel) return undefined
    return subscribe(channel, (message) => handlerRef.current?.(message))
  }, [channel, subscribe])

  return status
}

export function useRealtimeJobs(jobs) {
  const { subscribe } = useRealtime()
  const [updates, setUpdates] = useState({})
  const ids = (jobs || []).map((job) => job.id).join(',')

  useEffect(() => {
    if (!ids) return undefined
    const unsubscribers = (jobs || []).map((job) => subscribe(`job:${job.id}`, (message) => {
      const data = message.data || {}
      if (message.type !== 'job.snapshot' && !data.progress) return
      setUpdates((current) => ({
        ...current,
        [job.id]: {
          ...(message.type === 'job.snapshot' ? data.job : {}),
          ...(data.progress?.status ? { status: data.progress.status } : {}),
          progress: data.progress,
          progress_revision: message.revision,
        },
      }))
    }))
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [ids, subscribe]) // eslint-disable-line react-hooks/exhaustive-deps

  return updates
}
