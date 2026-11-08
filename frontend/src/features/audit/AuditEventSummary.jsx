import { Badge } from '../../components/ui'
import { getAuditCategory, getTargetLabel } from './audit-catalog'
import { auditEventResult, formatAuditDate, formatAuditIdentifier } from './audit-formatters'

export default function AuditEventSummary({ event, definition }) {
  const category = getAuditCategory(definition)
  const result = auditEventResult(event)

  return (
    <section aria-labelledby="audit-summary-title">
      <h3 id="audit-summary-title" className="mb-2 text-sm font-semibold text-slate-900">
        Información general
      </h3>
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface-secondary px-4">
        <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
          <dt className="text-sm text-slate-500">Actor</dt>
          <dd className="min-w-0 wrap-anywhere text-sm font-medium text-slate-800 sm:text-right">
            {event.actor_name || 'Sistema'}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
          <dt className="text-sm text-slate-500">Recurso afectado</dt>
          <dd className="min-w-0 wrap-anywhere text-sm font-medium text-slate-800 sm:text-right">
            {getTargetLabel(event.target_type)}
          </dd>
        </div>
        {event.target_id ? (
          <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
            <dt className="text-sm text-slate-500">Identificador del recurso</dt>
            <dd className="min-w-0 wrap-anywhere text-right font-mono text-xs text-slate-600" title={event.target_id}>
              {formatAuditIdentifier(event.target_id)}
            </dd>
          </div>
        ) : null}
        <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
          <dt className="text-sm text-slate-500">Fecha y hora</dt>
          <dd className="text-sm font-medium text-slate-800 sm:text-right">{formatAuditDate(event.created_at)}</dd>
        </div>
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-sm text-slate-500">Resultado</dt>
          <dd className="sm:text-right"><Badge tone={result.tone}>{result.label}</Badge></dd>
        </div>
        <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between">
          <dt className="text-sm text-slate-500">Categoría</dt>
          <dd className="text-sm font-medium text-slate-800 sm:text-right">{category.label}</dd>
        </div>
      </dl>
    </section>
  )
}
