import { useEffect, useId, useRef } from 'react'
import AuditDetailFields from './AuditDetailFields'
import AuditEventHeader from './AuditEventHeader'
import AuditEventSummary from './AuditEventSummary'
import AuditTechnicalDetails from './AuditTechnicalDetails'
import { getAuditEventDefinition } from './audit-catalog'

export default function AuditDetailDrawer({ event, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const definition = event ? getAuditEventDefinition(event.action) : null

  useEffect(() => {
    if (!event) return undefined
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
    }
  }, [event, onClose])

  if (!event || !definition) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-slate-900/40 p-0 dark:bg-black/70 sm:p-4"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full flex-col overflow-hidden border border-slate-200 bg-surface-tertiary shadow-xl sm:h-[calc(100dvh-2rem)] sm:max-w-2xl sm:rounded-2xl"
      >
        <AuditEventHeader
          event={event}
          definition={definition}
          titleId={titleId}
          onClose={onClose}
          closeRef={closeRef}
        />
        <div className="admin-scroll-container min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <AuditEventSummary event={event} definition={definition} />
          <AuditDetailFields event={event} definition={definition} />
          <AuditTechnicalDetails event={event} />
        </div>
      </div>
    </div>
  )
}
