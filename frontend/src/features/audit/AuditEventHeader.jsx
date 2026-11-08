import { X } from 'lucide-react'
import { Badge } from '../../components/ui'
import { getAuditCategory } from './audit-catalog'
import { auditEventResult, formatAuditDate } from './audit-formatters'

export default function AuditEventHeader({ event, definition, titleId, onClose, closeRef }) {
  const category = getAuditCategory(definition)
  const result = auditEventResult(event)

  return (
    <header className="shrink-0 border-b border-slate-200 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={category.tone}>{category.label}</Badge>
            <Badge tone={result.tone}>{result.label}</Badge>
          </div>
          <h2 id={titleId} className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
            {definition.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{definition.description}</p>
          <p className="mt-2 text-xs text-slate-400">
            {formatAuditDate(event.created_at)} · Evento #{event.id}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          aria-label="Cerrar detalle de auditoría"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
