export const ADMIN_PERMISSIONS = [
  'admin.dashboard.read',
  'admin.users.read',
  'admin.users.write',
  'admin.accounts.read',
  'admin.accounts.create',
  'admin.accounts.write',
  'admin.organization.read',
  'admin.organization.write',
  'admin.drive.read',
  'admin.drive.browse',
  'admin.jobs.read',
  'admin.jobs.create',
  'admin.jobs.cancel',
  'admin.jobs.retry',
  'admin.storage.read',
  'admin.audit.read',
  'admin.policy.write',
  'admin.files.read',
]

export const MODERATOR_PERMISSIONS = [
  'admin.dashboard.read',
  'admin.users.read',
  'admin.users.write',
  'admin.organization.read',
  'admin.drive.read',
  'admin.jobs.read',
]

export const READ_ONLY_PERMISSIONS = [
  'admin.dashboard.read',
  'admin.users.read',
  'admin.organization.read',
  'admin.drive.read',
  'admin.jobs.read',
  'admin.storage.read',
  'admin.audit.read',
]

export const WORKER_PERMISSIONS = [
  'me.read',
  'me.profile.write',
  'me.drive.read',
  'me.drive.connect',
  'me.drive.disconnect',
  'me.jobs.read',
  'me.files.read',
  'me.policy.accept',
]
