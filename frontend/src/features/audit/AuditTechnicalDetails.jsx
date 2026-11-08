import { useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { formatAuditIdentifier } from './audit-formatters'

function CopyIdentifier({ value, label }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-xs text-slate-600" title={String(value)}>
        {formatAuditIdentifier(value)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        aria-label={`Copiar ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}

export default function AuditTechnicalDetails({ event }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-surface-secondary">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
        Información técnica
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="space-y-2 border-t border-slate-200 px-4 py-3 text-sm">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
          <dt className="text-slate-500">Código de evento</dt>
          <dd className="break-all text-right font-mono text-xs text-slate-700">{event.action}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
          <dt className="text-slate-500">Identificador del evento</dt>
          <dd className="text-right"><CopyIdentifier value={event.id} label="el identificador del evento" /></dd>
        </div>
        {event.actor_user_id ? (
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
            <dt className="text-slate-500">Identificador del actor</dt>
            <dd className="text-right"><CopyIdentifier value={event.actor_user_id} label="el identificador del actor" /></dd>
          </div>
        ) : null}
        {event.target_type ? (
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
            <dt className="text-slate-500">Tipo de recurso</dt>
            <dd className="break-all text-right font-mono text-xs text-slate-700">{event.target_type}</dd>
          </div>
        ) : null}
        {event.target_id ? (
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
            <dt className="text-slate-500">Identificador del recurso</dt>
            <dd className="text-right"><CopyIdentifier value={event.target_id} label="el identificador del recurso" /></dd>
          </div>
        ) : null}
      </dl>
    </details>
  )
}
