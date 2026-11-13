import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditPage from '../../src/pages/admin/AuditPage'
import { api } from '../../src/services/api'
import { formatDateOnly } from '../../src/utils/date-only'

vi.mock('../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, api: { get: vi.fn() } }
})

vi.mock('../../src/app/AuthContext', () => ({
  useAuth: () => ({ can: () => true }),
}))

const event = {
  id: 'event-1',
  action: 'download_job.created',
  actor_name: 'Ada Admin',
  target_type: 'download_job',
  target_id: 'job-1',
  created_at: '2026-11-10T15:30:00Z',
}

const month = () => formatDateOnly(new Date()).slice(0, 7)

function lastQuery() {
  const url = api.get.mock.calls.at(-1)?.[0] || ''
  return new URLSearchParams(url.split('?')[1] || '')
}

function dayButton(day) {
  const grid = screen.getByRole('grid')
  const cell = within(grid)
    .getAllByRole('gridcell')
    .find((item) => item.textContent.trim() === String(day))
  return within(cell).getByRole('button')
}

function selectDay(control, day) {
  fireEvent.click(screen.getByRole('button', { name: control }))
  fireEvent.click(dayButton(day))
}

describe('AuditPage con calendario global', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.get.mockResolvedValue({ data: [event], pagination: { total: 100 } })
  })

  it('envía el filtro de fecha en formato YYYY-MM-DD y conserva el rango', async () => {
    render(<AuditPage />)
    await screen.findByText('Trabajo de descarga creado')

    selectDay('Desde', 10)
    await waitFor(() => expect(lastQuery().get('from')).toBe(`${month()}-10`))
    expect(lastQuery().get('page')).toBe('1')

    selectDay('Hasta', 20)
    await waitFor(() => expect(lastQuery().get('to')).toBe(`${month()}-20`))
    expect(lastQuery().get('from')).toBe(`${month()}-10`)
    expect(api.get.mock.calls.filter(([url]) => url.includes('from='))).toHaveLength(2)
  })

  it('restringe los límites cruzados e impide días fuera del rango', async () => {
    render(<AuditPage />)
    await screen.findByText('Trabajo de descarga creado')

    selectDay('Hasta', 20)
    await waitFor(() => expect(lastQuery().get('to')).toBe(`${month()}-20`))

    fireEvent.click(screen.getByRole('button', { name: 'Desde' }))
    expect(dayButton(21)).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Desde' }))
    selectDay('Desde', 10)
    fireEvent.click(screen.getByRole('button', { name: 'Hasta' }))
    expect(dayButton(9)).toBeDisabled()
    expect(dayButton(10)).not.toBeDisabled()
  })

  it('limpia una fecha y restablece la paginación', async () => {
    render(<AuditPage />)
    await screen.findByText('Trabajo de descarga creado')

    selectDay('Desde', 10)
    await waitFor(() => expect(lastQuery().get('from')).toBe(`${month()}-10`))

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(lastQuery().get('page')).toBe('2'))

    selectDay('Desde', 15)
    await waitFor(() => expect(lastQuery().get('page')).toBe('1'))
    expect(lastQuery().get('from')).toBe(`${month()}-15`)

    fireEvent.click(screen.getByRole('button', { name: 'Desde' }))
    fireEvent.click(screen.getByRole('button', { name: /Limpiar fecha/i }))
    await waitFor(() => expect(lastQuery().has('from')).toBe(false))
  })

  it('no duplica la consulta al aplicar los mismos filtros', async () => {
    render(<AuditPage />)
    await screen.findByText('Trabajo de descarga creado')
    const initialCalls = api.get.mock.calls.length

    fireEvent.change(screen.getByLabelText('Filtrar por acción'), { target: { value: 'download_job.created' } })
    fireEvent.click(screen.getByRole('button', { name: /Filtrar/i }))
    await waitFor(() => expect(lastQuery().get('action')).toBe('download_job.created'))
    const afterApply = api.get.mock.calls.length
    expect(afterApply).toBe(initialCalls + 1)

    fireEvent.click(screen.getByRole('button', { name: /Filtrar/i }))
    await waitFor(() => expect(api.get.mock.calls.length).toBe(afterApply))
  })

  it('mantiene fechas vacías válidas y el detalle disponible', async () => {
    render(<AuditPage />)
    await screen.findByText('Trabajo de descarga creado')
    const initialCalls = api.get.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /Filtrar/i }))
    await waitFor(() => expect(api.get.mock.calls.length).toBe(initialCalls))
    expect(lastQuery().has('from')).toBe(false)
    expect(lastQuery().has('to')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Ver detalle/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
