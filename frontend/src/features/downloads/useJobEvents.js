import { useEffect, useState } from 'react'

// Subscribes to the job SSE channel. PostgreSQL stays authoritative: the snapshot
// event carries the current row, and reconnection re-sends it.
export function useJobEvents(jobId, onSnapshot) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!jobId) return undefined
    const source = new EventSource(`/api/v1/download-jobs/${jobId}/events`)
    const handler = (event) => {
      try {
        onSnapshot(JSON.parse(event.data))
      } catch {
        // Ignore malformed frames; polling remains available.
      }
    }
    const onOpen = () => setConnected(true)
    const onError = () => setConnected(false)
    const onDone = (event) => {
      handler(event)
      setConnected(false)
      source.close()
    }
    source.addEventListener('open', onOpen)
    source.addEventListener('snapshot', handler)
    source.addEventListener('done', onDone)
    source.onopen = onOpen
    source.onerror = onError
    return () => {
      source.removeEventListener('snapshot', handler)
      source.removeEventListener('done', onDone)
      source.close()
    }
  }, [jobId, onSnapshot])

  return connected
}
