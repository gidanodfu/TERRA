import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RealtimeProvider, useRealtimeChannel } from '../../src/features/realtime/RealtimeContext'

const auth = vi.hoisted(() => ({ user: { id: 'user-1' } }))
vi.mock('../../src/app/AuthContext', () => ({ useAuth: () => auth }))

class FakeWebSocket {
  static OPEN = 1
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    FakeWebSocket.instances.push(this)
  }

  send(raw) {
    this.sent.push(JSON.parse(raw))
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  message(value) {
    this.onmessage?.({ data: JSON.stringify(value) })
  }
}

function Probe({ onMessage }) {
  const status = useRealtimeChannel('job:job-1', onMessage)
  return <span>{status}</span>
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    globalThis.WebSocket = FakeWebSocket
  })

  it('mantiene una conexión, suscribe, descarta revisiones viejas y resuscribe al reconectar', () => {
    const onMessage = vi.fn()
    render(<RealtimeProvider><Probe onMessage={onMessage} /></RealtimeProvider>)

    expect(FakeWebSocket.instances).toHaveLength(1)
    const first = FakeWebSocket.instances[0]
    expect(first.url).toMatch(/\/api\/v1\/realtime$/)
    act(() => first.open())
    expect(first.sent).toContainEqual({ type: 'subscribe', channel: 'job:job-1', last_event_id: 0 })
    expect(screen.getByText('connected')).toBeInTheDocument()

    act(() => first.message({ type: 'job.progress', revision: 5, event_id: 12, data: { job_id: 'job-1' } }))
    expect(onMessage).toHaveBeenCalledTimes(1)
    act(() => first.message({ type: 'job.progress', revision: 4, data: { job_id: 'job-1' } }))
    expect(onMessage).toHaveBeenCalledTimes(1)

    act(() => first.close())
    act(() => vi.advanceTimersByTime(5000))
    expect(FakeWebSocket.instances).toHaveLength(2)
    const second = FakeWebSocket.instances[1]
    act(() => second.open())
    expect(second.sent).toContainEqual({ type: 'subscribe', channel: 'job:job-1', last_event_id: 12 })
  })
})
