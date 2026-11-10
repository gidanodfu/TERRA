export const AUDIT_CATEGORIES = {
  authentication: { label: 'Autenticación', tone: 'bg-sky-100 text-sky-800' },
  accounts: { label: 'Cuentas administrativas', tone: 'bg-brand-50 text-brand-800' },
  organization: { label: 'Trabajadores y organización', tone: 'bg-slate-100 text-slate-700' },
  drive: { label: 'Google Drive', tone: 'bg-emerald-100 text-emerald-800' },
  policy: { label: 'Política institucional', tone: 'bg-amber-100 text-amber-800' },
  jobs: { label: 'Trabajos de descarga', tone: 'bg-brand-50 text-brand-800' },
  files: { label: 'Archivos', tone: 'bg-slate-100 text-slate-700' },
  system: { label: 'Sistema', tone: 'bg-slate-100 text-slate-700' },
}

const action = (title, category, description, fields = [], options = {}) => ({
  title, category, description, fields, ...options,
})

export const AUDIT_ACTIONS = {
  'auth.google.login': action(
    'Inicio de sesión con Google', 'authentication',
    'Acceso de un trabajador mediante su cuenta de Google.',
    ['provider'],
  ),
  'auth.admin.login': action(
    'Inicio de sesión administrativo', 'authentication',
    'Acceso a TERRA con credenciales locales administrativas.',
  ),
  'auth.admin.login_failed': action(
    'Intento de acceso rechazado', 'authentication',
    'Intento de inicio de sesión administrativo que no fue autorizado.',
    ['username', 'reason'],
    { defaultResult: 'rejected' },
  ),
  'auth.password.changed': action(
    'Contraseña actualizada', 'authentication',
    'Cambio de contraseña local y cierre de las demás sesiones.',
  ),
  'auth.logout': action(
    'Cierre de sesión', 'authentication',
    'Finalización explícita de una sesión.',
    ['user_id'],
    { defaultResult: 'neutral' },
  ),

  'admin.account.created': action(
    'Cuenta administrativa creada', 'accounts',
    'Alta de una cuenta con rol administrativo.',
    ['role', 'username'],
  ),
  'admin.account.disabled': action(
    'Cuenta administrativa desactivada', 'accounts',
    'Desactivación de una cuenta administrativa.',
    ['roles', 'previous_status', 'status'],
  ),
  'admin.account.reactivated': action(
    'Cuenta administrativa reactivada', 'accounts',
    'Reactivación de una cuenta administrativa.',
    ['roles', 'previous_status', 'status'],
  ),
  'admin.account.status_rejected': action(
    'Cambio de cuenta rechazado', 'accounts',
    'Intento de cambio de estado bloqueado por una regla de protección.',
    ['roles', 'previous_status', 'status', 'reason'],
    { defaultResult: 'rejected' },
  ),

  'admin.user.updated': action(
    'Trabajador actualizado', 'organization',
    'Cambio de asignación organizativa o estado de un trabajador.',
    ['previous_status', 'status', 'area_id', 'position_id'],
  ),
  'user.profile.updated': action(
    'Perfil de trabajador actualizado', 'organization',
    'Actualización del perfil organizativo propio.',
    ['area_id', 'position_id'],
  ),
  'area.created': action(
    'Área creada', 'organization',
    'Alta de un área organizativa.',
    ['name', 'responsibilities'],
  ),
  'area.updated': action(
    'Área actualizada', 'organization',
    'Modificación de un área organizativa.',
    ['name', 'status', 'responsibilities'],
  ),
  'position.created': action(
    'Cargo creado', 'organization',
    'Alta de un cargo dentro de un área.',
    ['name', 'area_id', 'responsibilities'],
  ),
  'position.updated': action(
    'Cargo actualizado', 'organization',
    'Modificación de un cargo.',
    ['name', 'status', 'responsibilities'],
  ),

  'drive.connected': action(
    'Google Drive conectado', 'drive',
    'Autorización individual de una cuenta de Google Drive.',
    ['email', 'provider'],
  ),
  'drive.disconnected': action(
    'Google Drive desconectado', 'drive',
    'Revocación de la conexión individual con Google Drive.',
  ),

  'policy.accepted': action(
    'Política institucional aceptada', 'policy',
    'Consentimiento de la versión vigente de la política institucional.',
    ['version'],
  ),
  'policy.published': action(
    'Política institucional publicada', 'policy',
    'Publicación de una nueva versión de la política institucional.',
    ['version'],
  ),

  'download_job.created': action(
    'Trabajo de descarga creado', 'jobs',
    'Creación de un snapshot documental.',
    ['scope_type', 'owner_user_id', 'roots', 'file_roots', 'selected_total'],
  ),
  'download_job.cancel_requested': action(
    'Cancelación solicitada', 'jobs',
    'Solicitud de cancelación de un trabajo de descarga.',
    [],
    { defaultResult: 'requested' },
  ),
  'download_job.retried': action(
    'Trabajo reintentado', 'jobs',
    'Reintento de los elementos fallidos de un trabajo.',
  ),

  'file.accessed': action(
    'Acceso al archivo autorizado', 'files',
    'Descarga autorizada de un archivo almacenado.',
    ['owner_user_id', 'job_id'],
  ),
  'file.access_failed': action(
    'Acceso al archivo rechazado', 'files',
    'Intento de acceso a un archivo físico no disponible.',
    ['owner_user_id', 'job_id', 'reason'],
    { defaultResult: 'rejected' },
  ),
}

export const GENERIC_AUDIT_EVENT = action(
  'Evento no catalogado', 'system',
  'Evento de auditoría sin una presentación especializada.',
)

export const AUDIT_FIELD_LABELS = {
  kind: 'Tipo de registro',
  role: 'Rol',
  roles: 'Roles',
  username: 'Usuario',
  result: 'Resultado',
  previous_status: 'Estado anterior',
  status: 'Estado actual',
  area_id: 'Identificador del área',
  position_id: 'Identificador del cargo',
  owner_user_id: 'Propietario del Drive',
  user_id: 'Usuario relacionado',
  job_id: 'Trabajo asociado',
  scope_type: 'Modalidad del snapshot',
  roots: 'Carpetas raíz',
  file_roots: 'Archivos individuales',
  selected_total: 'Elementos seleccionados',
  email: 'Cuenta autorizada',
  provider: 'Proveedor',
  reason: 'Motivo',
  name: 'Nombre',
  version: 'Versión',
  responsibilities: 'Responsabilidades',
}

export const TARGET_LABELS = {
  user: 'Trabajador o cuenta',
  area: 'Área',
  position: 'Cargo',
  drive_connection: 'Conexión de Google Drive',
  policy: 'Política institucional',
  download_job: 'Trabajo de descarga',
  stored_file: 'Archivo almacenado',
  session: 'Sesión',
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'access_token',
  'refresh_token',
  'refresh_token_ciphertext',
  'client_secret',
  'authorization',
  'cookie',
  'session_token',
  'csrf',
  'csrf_token',
  'idempotency_key',
  'credential',
  'credentials',
  'secret',
  'relative_path',
  'absolute_path',
  'path',
  'content',
  'binary',
])

export function isSensitiveAuditKey(key) {
  const normalized = String(key).toLowerCase()
  return SENSITIVE_KEYS.has(normalized) ||
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('authorization') ||
    normalized.includes('cookie') ||
    normalized.includes('csrf') ||
    normalized.endsWith('_path')
}

export function safeAuditMetadata(metadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata || {}).filter(([key]) => !isSensitiveAuditKey(key)),
  )
}

export function getAuditEventDefinition(actionName) {
  return AUDIT_ACTIONS[actionName] || {
    ...GENERIC_AUDIT_EVENT,
    title: 'Evento no catalogado',
    code: actionName,
  }
}

export function getAuditCategory(definition) {
  return AUDIT_CATEGORIES[definition.category] || AUDIT_CATEGORIES.system
}

export function getTargetLabel(targetType) {
  return TARGET_LABELS[targetType] || targetType || 'No disponible'
}
