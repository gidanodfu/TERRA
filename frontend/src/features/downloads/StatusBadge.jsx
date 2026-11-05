import { Badge } from '../../components/ui'
import { ITEM_STATUS, JOB_STATUS, CONNECTION_STATUS, USER_STATUS } from '../../utils/format'

const MAPS = {
  job: JOB_STATUS,
  item: ITEM_STATUS,
  connection: CONNECTION_STATUS,
  user: USER_STATUS,
}

export function StatusBadge({ type = 'job', status, className = '' }) {
  const entry = MAPS[type]?.[status] || { label: status || 'Desconocido', tone: 'bg-slate-100 text-slate-700' }
  return (
    <Badge tone={entry.tone}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current opacity-70 ${className}`} />
      {entry.label}
    </Badge>
  )
}

export function ScopeLabel({ scope }) {
  if (scope === 'my_drive_full') return 'Mi unidad completa'
  if (scope === 'selected_items') return 'Archivos y carpetas seleccionadas'
  return 'Carpetas seleccionadas'
}
