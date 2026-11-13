import { describe, expect, it } from 'vitest'
import {
  formatDateDisplay,
  formatDateOnly,
  isValidDateOnly,
  isValidDateRange,
  parseDateOnly,
} from '../../src/utils/date-only'

describe('utilidades de fecha sin hora', () => {
  it('parsea fechas válidas y rechaza normalizaciones de JavaScript', () => {
    expect(formatDateOnly(parseDateOnly('2024-02-29'))).toBe('2024-02-29')
    expect(formatDateOnly(parseDateOnly('2026-02-28'))).toBe('2026-02-28')
    for (const value of ['2025-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '10/11/2026', '', null]) {
      expect(parseDateOnly(value)).toBeNull()
      expect(isValidDateOnly(value)).toBe(false)
    }
  })

  it('serializa componentes locales sin pasar por UTC', () => {
    const date = new Date(2026, 0, 1)
    expect(formatDateOnly(date)).toBe('2026-01-01')
    expect(formatDateDisplay('2026-01-01')).toMatch(/^01\/01\/2026$/)
  })

  it('valida rangos inclusivos y opcionales', () => {
    expect(isValidDateRange('', '')).toBe(true)
    expect(isValidDateRange('2026-11-10', '')).toBe(true)
    expect(isValidDateRange('', '2026-11-10')).toBe(true)
    expect(isValidDateRange('2026-11-10', '2026-11-10')).toBe(true)
    expect(isValidDateRange('2026-11-10', '2026-11-11')).toBe(true)
    expect(isValidDateRange('2026-11-11', '2026-11-10')).toBe(false)
    expect(isValidDateRange('2026-02-30', '2026-03-01')).toBe(false)
  })

  it('admite meses de 28, 29, 30 y 31 días', () => {
    for (const value of ['2026-02-28', '2024-02-29', '2026-04-30', '2026-01-31']) {
      expect(isValidDateOnly(value)).toBe(true)
    }
  })
})
