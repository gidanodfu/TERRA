import { describe, expect, it } from 'vitest'
import { isAdministrativeAccount, isWorkerAccount } from '../../src/features/auth/roles'

describe('clasificación de cuentas', () => {
  it('clasifica como trabajador solo al rol user exclusivo', () => {
    expect(isWorkerAccount({ roles: ['user'] })).toBe(true)
    expect(isWorkerAccount({ roles: ['admin'] })).toBe(false)
    expect(isWorkerAccount({ roles: ['moderator'] })).toBe(false)
    expect(isWorkerAccount({ roles: ['read_only'] })).toBe(false)
  })

  it('las cuentas mixtas y los roles desconocidos nunca son trabajadores', () => {
    expect(isWorkerAccount({ roles: ['admin', 'user'] })).toBe(false)
    expect(isWorkerAccount({ roles: ['reader'] })).toBe(false)
    expect(isWorkerAccount({ roles: [] })).toBe(false)
    expect(isAdministrativeAccount({ roles: ['admin', 'user'] })).toBe(true)
    expect(isAdministrativeAccount({ roles: ['moderator'] })).toBe(true)
    expect(isAdministrativeAccount({ roles: ['read_only'] })).toBe(true)
    expect(isAdministrativeAccount({ roles: ['user'] })).toBe(false)
  })
})
