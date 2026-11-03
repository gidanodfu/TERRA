import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useJobEvents } from '../../src/features/downloads/useJobEvents'
import { MockEventSource } from '../helpers/event-source'

describe('useJobEvents', () => {
  beforeEach(() => {
    MockEventSource.instances = []
  })

  it('abre el canal con el job y entrega snapshots', () => {
    const onSnapshot = vi.fn()
    const { unmount } = renderHook(() => useJobEvents('job-1', onSnapshot))
    const source = MockEventSource.instances[0]
    expect(source.url).toBe('/api/v1/download-jobs/job-1/events')
    act(() => source.emit('snapshot', { status: 'downloading', completed_items: 1 }))
    expect(onSnapshot).toHaveBeenCalledWith({ status: 'downloading', completed_items: 1 })
    unmount()
    expect(source.closed).toBe(true)
  })

  it('cierra el canal al recibir done', () => {
    const onSnapshot = vi.fn()
    renderHook(() => useJobEvents('job-2', onSnapshot))
    const source = MockEventSource.instances[0]
    act(() => source.emit('done', { status: 'completed' }))
    expect(onSnapshot).toHaveBeenCalledWith({ status: 'completed' })
    expect(source.closed).toBe(true)
  })
})
