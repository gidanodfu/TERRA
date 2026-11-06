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
  AUDIT_OPERATIONAL_READ: 'admin.audit.operational.read',
  POLICY_WRITE: 'admin.policy.write',
  FILES_READ: 'admin.files.read',
}

export const ADMIN_ROLE_OPTIONS = [
  {
    value: 'admin',
    label: 'Administrador',
    description: 'Administración integral de TERRA. Puede gestionar trabajadores, cuentas administrativas, organización, conexiones Drive, trabajos, almacenamiento, políticas y auditoría completa.',
    can: [
      'Trabajadores y cuentas administrativas',
      'Organización, conexiones y trabajos',
      'Almacenamiento, políticas y auditoría completa',
    ],
    cannot: [],
  },
  {
    value: 'moderator',
    label: 'Moderador',
    description: 'Gestión operativa de trabajadores. Puede modificar asignaciones y estados, consultar conexiones y trabajos, y revisar auditoría operacional. No administra cuentas administrativas ni configuraciones institucionales.',
    can: [
      'Modificar asignaciones y estados de trabajadores',
      'Consultar organización, conexiones y trabajos',
      'Revisar auditoría operacional',
    ],
    cannot: [
      'Administrar cuentas administrativas',
      'Organización, Drive, almacenamiento o políticas',
      'Auditoría de seguridad y administración',
    ],
  },
  {
    value: 'read_only',
    label: 'Solo lectura',
    description: 'Consulta y supervisión institucional. Puede visualizar trabajadores, organización, conexiones, trabajos, metadatos de almacenamiento y auditoría completa. No puede modificar datos ni ejecutar operaciones.',
    can: [
      'Visualizar trabajadores, organización y conexiones',
      'Consultar trabajos y metadatos de almacenamiento',
      'Revisar auditoría institucional completa',
    ],
    cannot: [
      'Modificar trabajadores, perfiles o estados',
      'Gestionar cuentas, organización o políticas',
      'Ejecutar o cancelar trabajos',
    ],
  },
]

export const ADMIN_ROLE_LABELS = Object.fromEntries(
  ADMIN_ROLE_OPTIONS.map((role) => [role.value, role.label]),
)
