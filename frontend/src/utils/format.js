export function formatBytes(value) {
  if (value === null || value === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let number = Number(value)
  let unit = 0
  while (number >= 1024 && unit < units.length - 1) {
    number /= 1024
    unit += 1
  }
  return `${number.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateShort(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' })
}

export function durationBetween(start, end) {
  if (!start) return '—'
  const from = new Date(start).getTime()
  const to = end ? new Date(end).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((to - from) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export const JOB_STATUS = {
  queued: { label: 'En cola', tone: 'bg-slate-100 text-slate-700' },
  scanning: { label: 'Explorando', tone: 'bg-sky-100 text-sky-800' },
  downloading: { label: 'Descargando', tone: 'bg-brand-100 text-brand-800' },
  completed: { label: 'Completado', tone: 'bg-emerald-100 text-emerald-800' },
  partially_completed: { label: 'Parcial', tone: 'bg-amber-100 text-amber-800' },
  failed: { label: 'Fallido', tone: 'bg-red-100 text-red-800' },
  waiting_authorization: { label: 'Esperando autorización', tone: 'bg-orange-100 text-orange-800' },
  cancel_requested: { label: 'Cancelación solicitada', tone: 'bg-amber-100 text-amber-800' },
  cancelled: { label: 'Cancelado', tone: 'bg-slate-200 text-slate-700' },
}

export const ITEM_STATUS = {
  pending: { label: 'Pendiente', tone: 'bg-slate-100 text-slate-700' },
  downloading: { label: 'Descargando', tone: 'bg-sky-100 text-sky-800' },
  completed: { label: 'Completado', tone: 'bg-emerald-100 text-emerald-800' },
  skipped: { label: 'Omitido', tone: 'bg-amber-100 text-amber-800' },
  retrying: { label: 'Reintentando', tone: 'bg-orange-100 text-orange-800' },
  failed: { label: 'Fallido', tone: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelado', tone: 'bg-slate-200 text-slate-700' },
}

export const CONNECTION_STATUS = {
  connected: { label: 'Conectado', tone: 'bg-emerald-100 text-emerald-800' },
  reauthorization_required: { label: 'Requiere reconexión', tone: 'bg-orange-100 text-orange-800' },
  revoked: { label: 'Revocado', tone: 'bg-red-100 text-red-800' },
  error: { label: 'Error', tone: 'bg-red-100 text-red-800' },
}

export const USER_STATUS = {
  pending_profile: { label: 'Perfil pendiente', tone: 'bg-amber-100 text-amber-800' },
  active: { label: 'Activo', tone: 'bg-emerald-100 text-emerald-800' },
  suspended: { label: 'Suspendido', tone: 'bg-orange-100 text-orange-800' },
  disabled: { label: 'Desactivado', tone: 'bg-red-100 text-red-800' },
}

export function itemProgressPercent(job) {
  if (!job) return 0
  const total = Math.max(job.total_items || 0, 1)
  const done = (job.completed_items || 0) + (job.skipped_items || 0) + (job.failed_items || 0)
  return Math.min(100, Math.round((done / total) * 100))
}

export function progressPercent(job) {
  const exact = job?.progress?.byte_progress_percent
  if (exact !== null && exact !== undefined && Number.isFinite(Number(exact))) {
    return Math.max(0, Math.min(100, Math.round(Number(exact))))
  }
  return itemProgressPercent(job)
}

export function progressIsIndeterminate(job) {
  return Boolean(job?.progress) && job.progress.byte_progress_percent === null
}

export function formatSeconds(value) {
  if (value === null || value === undefined) return '—'
  const seconds = Math.max(0, Math.round(Number(value)))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function isTerminal(status) {
  return ['completed', 'partially_completed', 'failed', 'cancelled'].includes(status)
}
