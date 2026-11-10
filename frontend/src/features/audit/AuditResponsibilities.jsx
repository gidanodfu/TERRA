import { Badge } from '../../components/ui'
import { compareResponsibilities } from './audit-formatters'

const TONES = {
  added: 'bg-emerald-100 text-emerald-800',
  removed: 'bg-red-100 text-red-800',
  kept: 'bg-slate-100 text-slate-700',
  reordered: 'bg-amber-100 text-amber-800',
}

function ResponsibilityList({ items, kind, comparison }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="text-sm text-slate-500">Sin responsabilidades registradas.</p>
  }
  return (
    <ol className="space-y-2">
      {items.map((item, index) => {
        let label = 'Conservada'
        let tone = TONES.kept
        if (kind === 'creation') {
          label = ''
        } else if (kind === 'before' && comparison.removed.includes(item)) {
          label = 'Eliminada'
          tone = TONES.removed
        } else if (kind === 'after' && comparison.added.includes(item)) {
          label = 'Agregada'
          tone = TONES.added
        } else if (comparison.reordered && comparison.kept.includes(item)) {
          label = 'Reordenada'
          tone = TONES.reordered
        }
        return (
          <li key={`${kind}-${item}`} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-surface-tertiary px-3 py-2">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-slate-600">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 wrap-anywhere text-sm text-slate-700">{item}</span>
            {label ? <Badge tone={tone}>{label}</Badge> : null}
          </li>
        )
      })}
    </ol>
  )
}

export default function AuditResponsibilities({ action, value }) {
  const isCreation = action.endsWith('.created')
  const hasValue = value && typeof value === 'object'

  if (!hasValue) {
    return (
      <section aria-label="Responsabilidades">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Responsabilidades</h3>
        <div className="rounded-xl border border-slate-200 bg-surface-secondary px-4 py-3">
          <p className="text-sm text-slate-500">
            {isCreation
              ? 'La información de responsabilidades no está disponible en este evento histórico.'
              : 'No se registraron cambios de responsabilidades en este evento.'}
          </p>
          {!isCreation ? <p className="mt-1 text-xs text-slate-400">Los eventos históricos pueden no incluir este dato.</p> : null}
        </div>
      </section>
    )
  }

  if (isCreation) {
    return (
      <section aria-label="Responsabilidades">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Responsabilidades iniciales</h3>
        <ResponsibilityList items={value.after} kind="creation" comparison={{ added: [], removed: [], kept: [], reordered: false }} />
      </section>
    )
  }

  if (!value.changed) {
    return (
      <section aria-label="Responsabilidades">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Responsabilidades</h3>
        <p className="rounded-xl border border-slate-200 bg-surface-secondary px-4 py-3 text-sm text-slate-500">
          Sin cambios de responsabilidades en este evento.
        </p>
      </section>
    )
  }

  const before = Array.isArray(value.before) ? value.before : []
  const after = Array.isArray(value.after) ? value.after : []
  const comparison = compareResponsibilities(before, after)

  return (
    <section aria-label="Responsabilidades">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Cambios en responsabilidades</h3>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone={TONES.added}>{comparison.added.length} agregada(s)</Badge>
        <Badge tone={TONES.removed}>{comparison.removed.length} eliminada(s)</Badge>
        <Badge tone={TONES.kept}>{comparison.kept.length} conservada(s)</Badge>
        {comparison.reordered ? <Badge tone={TONES.reordered}>Orden modificado</Badge> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Antes</h4>
          <ResponsibilityList items={before} kind="before" comparison={comparison} />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Después</h4>
          <ResponsibilityList items={after} kind="after" comparison={comparison} />
        </div>
      </div>
    </section>
  )
}
