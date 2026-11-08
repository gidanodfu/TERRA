import { Badge } from '../../components/ui'
import { getAuditCategory, getTargetLabel } from './audit-catalog'
import { auditEventResult, formatAuditDate, formatAuditIdentifier } from './audit-formatters'

function SummaryField({ label, children, full = false }) {
  return (
    <div className={`min-w-0 ${full ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 min-w-0 wrap-anywhere text-sm font-medium text-slate-800">{children}</dd>
    </div>
  )
}

export default function AuditEventSummary({ event, definition }) {
  const category = getAuditCategory(definition)
  const result = auditEventResult(event)

  return (
    <section aria-labelledby="audit-summary-title">
      <h3 id="audit-summary-title" className="mb-2 text-sm font-semibold text-slate-900">
        Información general
      </h3>
      <div className="rounded-xl border border-slate-200 bg-surface-secondary p-4">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <SummaryField label="Actor">{event.actor_name || 'Sistema'}</SummaryField>
          <SummaryField label="Recurso afectado">{getTargetLabel(event.target_type)}</SummaryField>
          <SummaryField label="Fecha y hora">{formatAuditDate(event.created_at)}</SummaryField>
          <SummaryField label="Resultado"><Badge tone={result.tone}>{result.label}</Badge></SummaryField>
          <SummaryField label="Categoría">{category.label}</SummaryField>
          {event.target_id ? (
            <SummaryField label="Identificador del recurso">
              <span className="font-mono text-xs text-slate-600" title={event.target_id}>
                {formatAuditIdentifier(event.target_id)}
              </span>
            </SummaryField>
          ) : null}
        </dl>
      </div>
    </section>
  )
}
