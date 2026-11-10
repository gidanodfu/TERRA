import { Badge } from '../../components/ui'
import AuditResponsibilities from './AuditResponsibilities'
import { USER_STATUS } from '../../utils/format'
import {
  AUDIT_FIELD_LABELS,
  isSensitiveAuditKey,
  safeAuditMetadata,
} from './audit-catalog'
import {
  formatAuditResult,
  formatAuditRole,
  formatAuditStatus,
  formatAuditValue,
  humanizeAuditKey,
} from './audit-formatters'

function fieldLabel(key) {
  return AUDIT_FIELD_LABELS[key] || humanizeAuditKey(key)
}

function PrimitiveValue({ fieldKey, value }) {
  if (fieldKey === 'status' || fieldKey === 'previous_status') {
    const status = USER_STATUS[value]
    return <Badge tone={status?.tone || 'bg-slate-100 text-slate-700'}>{status?.label || formatAuditStatus(value)}</Badge>
  }
  if (fieldKey === 'result') {
    const result = formatAuditResult(value)
    return <Badge tone={result.tone}>{result.label}</Badge>
  }
  if (fieldKey === 'roles' && Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-500">Sin elementos</span>
    return (
      <span className="flex flex-wrap justify-end gap-1">
        {value.map((role) => (
          <span key={role} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-slate-700">
            {formatAuditRole(role)}
          </span>
        ))}
      </span>
    )
  }
  return <span>{formatAuditValue(fieldKey, value)}</span>
}

function NestedValue({ value, fieldKey }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-500">No disponible</span>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-500">Sin elementos</span>
    const primitive = value.every((item) => item === null || typeof item !== 'object')
    if (primitive) {
      return (
        <span className="flex flex-wrap justify-end gap-1">
          {value.map((item, index) => (
            <span key={`${fieldKey}-${index}`} className="rounded-full bg-muted px-2 py-0.5 text-xs text-slate-700">
              {formatAuditValue(fieldKey, item)}
            </span>
          ))}
        </span>
      )
    }
    return (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={`${fieldKey}-${index}`} className="rounded-lg border border-slate-200 bg-surface-tertiary p-3 text-left">
            {item && typeof item === 'object' ? (
              <NestedObject value={item} />
            ) : (
              <span className="text-sm text-slate-700">{formatAuditValue(fieldKey, item)}</span>
            )}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === 'object') return <NestedObject value={value} />
  return <PrimitiveValue fieldKey={fieldKey} value={value} />
}

function NestedObject({ value }) {
  const entries = Object.entries(value || {}).filter(([key]) => !isSensitiveAuditKey(key))
  if (entries.length === 0) return <span className="text-slate-500">Sin datos</span>
  return (
    <dl className="space-y-1.5 text-left">
      {entries.map(([key, item]) => (
        <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
          <dt className="text-xs text-slate-500">{fieldLabel(key)}</dt>
          <dd className="min-w-0 wrap-anywhere text-xs text-slate-700 sm:text-right">
            <NestedValue fieldKey={key} value={item} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function AuditDetailFields({ event, definition }) {
  const metadata = safeAuditMetadata(event.metadata)
  const rows = []
  const organizationEvent = ['area.created', 'area.updated', 'position.created', 'position.updated'].includes(event.action)

  for (const key of definition.fields || []) {
    if (organizationEvent && key === 'responsibilities') continue
    if (key === 'version') {
      if (event.target_id) rows.push({ key, value: event.target_id })
      continue
    }
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      rows.push({ key, value: metadata[key] })
    }
  }

  const shown = new Set(rows.map((row) => row.key))
  for (const [key, value] of Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b))) {
    if (organizationEvent && key === 'responsibilities') continue
    if (!shown.has(key) && key !== 'result') rows.push({ key, value })
  }

  return (
    <section aria-labelledby="audit-context-title">
      <h3 id="audit-context-title" className="mb-2 text-sm font-semibold text-slate-900">
        Detalle del evento
      </h3>
      {organizationEvent ? (
        <div className="mb-4">
          <AuditResponsibilities action={event.action} value={metadata.responsibilities} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-surface-secondary px-4 py-3 text-sm text-slate-500">
          {organizationEvent ? 'El evento no registra otros metadatos adicionales.' : 'El evento no registra metadatos adicionales.'}
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-surface-secondary p-4">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {rows.map(({ key, value }) => {
              const wide = value !== null && typeof value === 'object'
              const longText = typeof value === 'string' && value.length > 48
              return (
                <div key={key} className={`min-w-0 ${wide || longText ? 'sm:col-span-2' : ''}`}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{fieldLabel(key)}</dt>
                  <dd className="mt-1 min-w-0 wrap-anywhere text-sm font-medium text-slate-800">
                    <NestedValue fieldKey={key} value={value} />
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      )}
    </section>
  )
}
