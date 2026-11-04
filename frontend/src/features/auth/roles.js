export const ADMINISTRATIVE_ROLES = ['admin', 'moderator', 'read_only']

export function isAdministrativeAccount(user) {
  return Boolean(user?.roles?.some((role) => ADMINISTRATIVE_ROLES.includes(role)))
}

// Mirrors the backend rule: only an account whose sole role is "user" is a worker.
export function isWorkerAccount(user) {
  const roles = user?.roles || []
  return roles.includes('user') && roles.every((role) => role === 'user')
}
