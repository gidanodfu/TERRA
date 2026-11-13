import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JobsPage from '../../src/pages/admin/JobsPage'
import { api } from '../../src/services/api'
import { formatDateOnly } from '../../src/utils/date-only'
import { jobs } from '../fixtures/jobs'

vi.mock('../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, api: { get: vi.fn() } }
})

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

describe('JobsPage con calendario global', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.get.mockImplementation((path) => {
      if (path === '/admin/areas') return Promise.resolve({ data: [{ id: 'area-1', name: 'Sistemas' }] })
      return Promise.resolve({ data: jobs, pagination: { total: 100 } })
    })
  })

  it('envía desde y hasta como fechas sin hora y conserva los demás filtros', async () => {
    render(
      <MemoryRouter>
        <JobsPage />
      </MemoryRouter>,
    )
    await screen.findByText('Trabajador Local')

    selectDay('Desde', 10)
    await waitFor(() => expect(lastQuery().get('from')).toBe(`${month()}-10`))
    expect(lastQuery().get('page')).toBe('1')

    selectDay('Hasta', 20)
    await waitFor(() => expect(lastQuery().get('to')).toBe(`${month()}-20`))
    expect(lastQuery().get('from')).toBe(`${month()}-10`)
    expect(lastQuery().get('page')).toBe('1')

    fireEvent.change(screen.getByLabelText('Buscar trabajos'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByRole('button', { name: /^Buscar$/i }))
    await waitFor(() => expect(lastQuery().get('q')).toBe('Ada'))
    expect(lastQuery().get('from')).toBe(`${month()}-10`)
    expect(lastQuery().get('to')).toBe(`${month()}-20`)
  })

  it('aplica los límites cruzados y restablece la página al limpiar', async () => {
    render(
      <MemoryRouter>
        <JobsPage />
      </MemoryRouter>,
    )
    await screen.findByText('Trabajador Local')

    selectDay('Hasta', 20)
    await waitFor(() => expect(lastQuery().get('to')).toBe(`${month()}-20`))
    fireEvent.click(screen.getByRole('button', { name: 'Desde' }))
    expect(dayButton(21)).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Desde' }))

    selectDay('Desde', 10)
    await waitFor(() => expect(lastQuery().get('from')).toBe(`${month()}-10`))
    fireEvent.click(screen.getByRole('button', { name: 'Hasta' }))
    expect(dayButton(9)).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(lastQuery().get('page')).toBe('2'))
    fireEvent.click(screen.getByRole('button', { name: 'Hasta' }))
    fireEvent.click(screen.getByRole('button', { name: /Limpiar fecha/i }))
    await waitFor(() => expect(lastQuery().get('page')).toBe('1'))
    expect(lastQuery().has('to')).toBe(false)
  })
})
