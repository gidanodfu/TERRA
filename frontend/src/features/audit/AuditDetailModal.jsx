import { useEffect, useId, useRef } from 'react'
import { Button } from '../../components/ui'
import AuditDetailFields from './AuditDetailFields'
import AuditEventHeader from './AuditEventHeader'
import AuditEventSummary from './AuditEventSummary'
import AuditTechnicalDetails from './AuditTechnicalDetails'
import { getAuditEventDefinition } from './audit-catalog'

export default function AuditDetailModal({ event, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const definition = event ? getAuditEventDefinition(event.action) : null

  useEffect(() => {
    if (!event) return undefined
    const previouslyFocused = document.activeElement
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (keyboardEvent) => {
      if (keyboardEvent.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [event, onClose])

  if (!event || !definition) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-2 dark:bg-black/70 sm:p-6"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[800px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface-tertiary shadow-xl sm:max-h-[86dvh] sm:max-w-[90vw] lg:max-w-[800px]"
      >
        <AuditEventHeader
          event={event}
          definition={definition}
          titleId={titleId}
          onClose={onClose}
          closeRef={closeRef}
        />
        <div data-testid="audit-detail-body" className="admin-scroll-container min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <AuditEventSummary event={event} definition={definition} />
          <AuditDetailFields event={event} definition={definition} />
          <AuditTechnicalDetails event={event} />
        </div>
        <footer data-testid="audit-detail-footer" className="flex shrink-0 justify-end border-t border-slate-200 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </footer>
      </div>
    </div>
  )
}
