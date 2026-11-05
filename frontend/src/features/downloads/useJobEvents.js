import { useEffect, useState } from 'react'

// Se suscribe al canal SSE del trabajo. PostgreSQL sigue siendo la fuente de verdad: el evento
// de snapshot transporta la fila actual y la reconexión lo vuelve a enviar.
export function useJobEvents(jobId, onSnapshot) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!jobId) return undefined
    const source = new EventSource(`/api/v1/download-jobs/${jobId}/events`)
    const handler = (event) => {
      try {
        onSnapshot(JSON.parse(event.data))
      } catch {
        // Ignora tramas malformadas; el polling sigue disponible.
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
