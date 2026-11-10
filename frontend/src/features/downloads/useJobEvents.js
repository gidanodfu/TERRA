import { useCallback } from 'react'
import { useRealtimeChannel } from '../realtime/RealtimeContext'

// Mantiene el detalle del trabajo suscrito al canal central de WebSockets.
// PostgreSQL sigue siendo la fuente de verdad y el snapshot permite reconectar.
export function useJobEvents(jobId, onSnapshot) {
  const handleMessage = useCallback((message) => {
    const data = message.data || {}
    if (message.type === 'job.snapshot') {
      onSnapshot({ ...(data.job || {}), progress: data.progress, progress_revision: message.revision })
      return
    }
    if (message.type === 'job.progress') {
      onSnapshot({ progress: data.progress, progress_revision: message.revision })
      return
    }
    if (message.type === 'job.done') {
      onSnapshot({ ...(data.payload || {}), progress: data.progress, progress_revision: message.revision })
    }
  }, [onSnapshot])

  const status = useRealtimeChannel(jobId ? `job:${jobId}` : null, handleMessage)
  return status === 'connected'
}
