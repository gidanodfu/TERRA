export const ADMINISTRATIVE_ROLES = ['admin', 'moderator', 'read_only']

export function isAdministrativeAccount(user) {
  return Boolean(user?.roles?.some((role) => ADMINISTRATIVE_ROLES.includes(role)))
}

// Refleja la regla del backend: solo una cuenta cuyo único rol es "user" es un trabajador.
export function isWorkerAccount(user) {
  const roles = user?.roles || []
  return roles.includes('user') && roles.every((role) => role === 'user')
}
