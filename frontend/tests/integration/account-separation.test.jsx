import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WorkerDetailPage from '../../src/pages/admin/WorkerDetailPage'
import WorkersPage from '../../src/pages/admin/WorkersPage'
import { api, queryString } from '../../src/services/api'

vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
  queryString: vi.fn(() => '?page=1'),
}))

vi.mock('../../src/app/AuthContext', () => ({
  useAuth: () => ({ can: () => true, user: { id: 'actor-1' } }),
}))

const worker = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'Tra',
  last_name: 'Bajador',
  display_name: 'Tra Bajador',
  email: 'worker@example.test',
  area_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  area_name: 'Sistemas',
  position_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position_name: 'Analista',
  status: 'active',
  roles: ['user'],
  created_at: '2026-01-01T00:00:00Z',
}

const administrative = {
  ...worker,
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Ada Admin',
  email: 'admin@example.test',
  area_id: null,
  area_name: '',
  position_id: null,
  position_name: '',
  roles: ['admin'],
}

function routeDetail(user) {
  api.get.mockImplementation((path) => {
    if (path === `/admin/users/${user.id}`) {
      return Promise.resolve({ user, organization_history: [], drive_connection: null })
    }
    if (path === '/admin/areas') {
      return Promise.resolve({ data: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sistemas' }] })
    }
    if (path === '/admin/areas/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/positions') {
      return Promise.resolve({ data: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Analista' }] })
    }
    return Promise.reject(new Error(`ruta inesperada ${path}`))
  })
}

function renderDetail(user) {
  return render(
    <MemoryRouter initialEntries={[`/app/admin/workers/${user.id}`]}>
      <Routes>
        <Route path="/app/admin/workers/:id" element={<WorkerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('separación de trabajadores y cuentas administrativas', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.patch.mockReset()
    queryString.mockReturnValue('?page=1')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('el listado consume el endpoint de trabajadores y muestra solo sus filas', async () => {
    api.get.mockResolvedValue({ data: [worker], pagination: { total: 1 } })
    render(
      <MemoryRouter>
        <WorkersPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Tra Bajador')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/admin/users?page=1')
    expect(screen.queryByText('Ada Admin')).not.toBeInTheDocument()
  })

  it('el detalle de un trabajador conserva asignación, estado e historial', async () => {
    routeDetail(worker)
    renderDetail(worker)

    expect(await screen.findByText('Modificar asignación')).toBeInTheDocument()
    expect(screen.getByLabelText('Área')).toBeInTheDocument()
    expect(screen.getByLabelText('Cargo')).toBeInTheDocument()
    expect(screen.getByLabelText('Estado de la cuenta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar cambios/i })).toBeInTheDocument()
  })

  it('el detalle de una cuenta administrativa no muestra formularios organizativos', async () => {
    routeDetail(administrative)
    renderDetail(administrative)

    expect(await screen.findByText(/Esta cuenta es administrativa/i)).toBeInTheDocument()
    expect(screen.queryByText('Modificar asignación')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Guardar cambios/i })).not.toBeInTheDocument()
  })
})
