import { formatBytes, formatDate, USER_STATUS } from '../../utils/format'

const SCOPE_LABELS = {
  my_drive_full: 'Mi unidad completa',
  selected_folders: 'Carpetas seleccionadas',
  selected_items: 'Archivos y carpetas seleccionados',
}

const ROLE_LABELS = {
  admin: 'Administrador',
  moderator: 'Moderador',
  read_only: 'Solo lectura',
  user: 'Trabajador',
}

const REASON_LABELS = {
  turnstile: 'Verificación de seguridad no superada',
  credentials: 'Credenciales incorrectas',
  not_administrative: 'La cuenta no tiene acceso administrativo',
  inactive: 'La cuenta está suspendida o desactivada',
  not_available: 'Archivo físico no disponible',
  cannot_disable_self: 'No puede desactivar su propia cuenta',
  principal_admin_protected: 'El administrador principal está protegido',
  principal_admin_unresolved: 'No se pudo verificar el administrador principal',
}

const RESULT_LABELS = {
  applied: { label: 'Aplicado', tone: 'bg-emerald-100 text-emerald-800' },
  created: { label: 'Creado', tone: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rechazado', tone: 'bg-red-100 text-red-800' },
  requested: { label: 'Solicitado', tone: 'bg-amber-100 text-amber-800' },
  success: { label: 'Correcto', tone: 'bg-emerald-100 text-emerald-800' },
  neutral: { label: 'Registrado', tone: 'bg-slate-100 text-slate-700' },
}

const IDENTIFIER_KEYS = new Set([
  'actor_user_id', 'user_id', 'owner_user_id', 'job_id', 'area_id', 'position_id',
])

const SIZE_KEYS = new Set(['size_bytes', 'total_bytes', 'downloaded_bytes'])

export function humanizeAuditKey(key) {
  const text = String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!text) return 'Campo'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatAuditDate(value) {
  return formatDate(value)
}

export function formatAuditIdentifier(value) {
  const text = String(value || '')
  if (text.length <= 12) return text
  return `${text.slice(0, 8)}…${text.slice(-4)}`
}

export function formatAuditScope(value) {
  return SCOPE_LABELS[value] || humanizeAuditKey(value)
}

export function formatAuditRole(value) {
  if (Array.isArray(value)) return value.map(formatAuditRole).join(', ')
  return ROLE_LABELS[value] || humanizeAuditKey(value)
}

export function formatAuditStatus(value) {
  return USER_STATUS[value]?.label || humanizeAuditKey(value)
}

export function formatAuditReason(value) {
  return REASON_LABELS[value] || humanizeAuditKey(value)
}

export function formatAuditKind(value) {
  const labels = { worker: 'Trabajador', administrative: 'Cuenta administrativa' }
  return labels[value] || humanizeAuditKey(value)
}

export function formatAuditProvider(value) {
  return String(value || '').toLowerCase() === 'google' ? 'Google' : humanizeAuditKey(value)
}

export function formatAuditResult(value) {
  return RESULT_LABELS[value] || { label: humanizeAuditKey(value), tone: 'bg-slate-100 text-slate-700' }
}

export function auditEventResult(event) {
  const raw = event?.metadata?.result
  if (raw && RESULT_LABELS[raw]) return RESULT_LABELS[raw]
  if (event?.action?.endsWith('_failed') || event?.action === 'admin.account.status_rejected') {
    return RESULT_LABELS.rejected
  }
  if (event?.action === 'download_job.cancel_requested') return RESULT_LABELS.requested
  if (event?.action === 'auth.logout') return RESULT_LABELS.neutral
  return RESULT_LABELS.success
}

export function formatAuditValue(key, value) {
  if (value === null || value === undefined) return 'No disponible'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (key === 'scope_type') return formatAuditScope(value)
  if (key === 'role' || key === 'roles') return formatAuditRole(value)
  if (key === 'status' || key === 'previous_status') return formatAuditStatus(value)
  if (key === 'reason') return formatAuditReason(value)
  if (key === 'kind') return formatAuditKind(value)
  if (key === 'provider') return formatAuditProvider(value)
  if (SIZE_KEYS.has(key) && Number.isFinite(Number(value))) return formatBytes(value)
  if (IDENTIFIER_KEYS.has(key)) return formatAuditIdentifier(value)
  if (typeof value === 'number') return new Intl.NumberFormat('es-MX').format(value)
  const text = String(value)
  return text.trim() === '' ? 'No disponible' : text
}
