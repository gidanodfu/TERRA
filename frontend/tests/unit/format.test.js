import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  isTerminal,
  progressPercent,
  JOB_STATUS,
  ITEM_STATUS,
} from '../../src/utils/format'

describe('formatBytes', () => {
  it('formatea bytes y unidades', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(null)).toBe('—')
  })
})

describe('progressPercent', () => {
  it('considera completados, omitidos y fallidos', () => {
    expect(progressPercent({ total_items: 10, completed_items: 3, skipped_items: 1, failed_items: 1 })).toBe(50)
    expect(progressPercent({ total_items: 0, completed_items: 0 })).toBe(0)
    expect(progressPercent(null)).toBe(0)
  })
})

describe('estados', () => {
  it('detecta estados terminales', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('downloading')).toBe(false)
  })

  it('expone etiquetas de trabajo y elemento', () => {
    expect(JOB_STATUS.downloading.label).toBe('Descargando')
    expect(ITEM_STATUS.skipped.label).toBe('Omitido')
  })
})
