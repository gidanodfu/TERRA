import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useJobEvents } from '../../src/features/downloads/useJobEvents'
import { useRealtimeChannel } from '../../src/features/realtime/RealtimeContext'

vi.mock('../../src/features/realtime/RealtimeContext', () => ({
  useRealtimeChannel: vi.fn(() => 'connected'),
}))

describe('useJobEvents', () => {
  it('se suscribe al canal del trabajo y entrega el snapshot persistido', () => {
    const onSnapshot = vi.fn()
    const { result } = renderHook(() => useJobEvents('job-1', onSnapshot))
    expect(result.current).toBe(true)
    expect(useRealtimeChannel).toHaveBeenCalledWith('job:job-1', expect.any(Function))
    const handler = useRealtimeChannel.mock.calls[0][1]

    handler({
      type: 'job.snapshot',
      revision: 4,
      data: { job: { id: 'job-1', status: 'downloading' }, progress: { byte_progress_percent: 30 } },
    })
    expect(onSnapshot).toHaveBeenCalledWith({
      id: 'job-1',
      status: 'downloading',
      progress: { byte_progress_percent: 30 },
      progress_revision: 4,
    })

    handler({
      type: 'job.progress',
      revision: 5,
      data: { job_id: 'job-1', progress: { byte_progress_percent: 42 } },
    })
    expect(onSnapshot).toHaveBeenLastCalledWith({
      progress: { byte_progress_percent: 42 },
      progress_revision: 5,
    })
  })

  it('no abre canal sin trabajo', () => {
    const onSnapshot = vi.fn()
    renderHook(() => useJobEvents(null, onSnapshot))
    expect(useRealtimeChannel).toHaveBeenLastCalledWith(null, expect.any(Function))
  })
})
