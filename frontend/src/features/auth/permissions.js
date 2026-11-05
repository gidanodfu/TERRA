export const PERMISSIONS = {
  DASHBOARD_READ: 'admin.dashboard.read',
  USERS_READ: 'admin.users.read',
  USERS_WRITE: 'admin.users.write',
  ACCOUNTS_READ: 'admin.accounts.read',
  ACCOUNTS_CREATE: 'admin.accounts.create',
  ACCOUNTS_WRITE: 'admin.accounts.write',
  ORGANIZATION_READ: 'admin.organization.read',
  ORGANIZATION_WRITE: 'admin.organization.write',
  DRIVE_READ: 'admin.drive.read',
  DRIVE_BROWSE: 'admin.drive.browse',
  JOBS_READ: 'admin.jobs.read',
  JOBS_CREATE: 'admin.jobs.create',
  JOBS_CANCEL: 'admin.jobs.cancel',
  JOBS_RETRY: 'admin.jobs.retry',
  STORAGE_READ: 'admin.storage.read',
  AUDIT_READ: 'admin.audit.read',
  POLICY_WRITE: 'admin.policy.write',
  FILES_READ: 'admin.files.read',
}

export const ADMIN_ROLE_OPTIONS = [
  {
    value: 'admin',
    label: 'Administrador',
    description: 'Acceso completo a trabajadores, cuentas, organización, Drive, trabajos, almacenamiento, auditoría y políticas.',
  },
  {
    value: 'moderator',
    label: 'Moderador',
    description: 'Puede consultar el panel y gestionar trabajadores y sus asignaciones. No administra cuentas ni publica políticas.',
  },
  {
    value: 'read_only',
    label: 'Solo lectura',
    description: 'Puede consultar trabajadores, organización, conexiones, trabajos, almacenamiento y auditoría sin modificar nada.',
  },
]

export const ADMIN_ROLE_LABELS = Object.fromEntries(
  ADMIN_ROLE_OPTIONS.map((role) => [role.value, role.label]),
)
