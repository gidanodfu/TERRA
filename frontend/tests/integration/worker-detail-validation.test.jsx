import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkerDetailPage from '../../src/pages/admin/WorkerDetailPage'
import { api } from '../../src/services/api'

vi.mock('../../src/app/AuthContext', () => ({
  useAuth: () => ({ can: () => true }),
}))

vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}))

const worker = {
  id: 'worker-1',
  first_name: 'María',
  last_name: 'Fernanda',
  display_name: 'María Fernanda',
  email: 'maria@example.test',
  status: 'active',
  roles: ['user'],
  area_id: 'area-1',
  area_name: 'Sistemas',
  position_id: 'pos-1',
  position_name: 'Analista',
  created_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/admin/workers/worker-1']}>
      <Routes>
        <Route path="/app/admin/workers/:id" element={<WorkerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WorkerDetailPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.patch.mockReset()
    api.get.mockImplementation((path) => {
      if (path === '/admin/users/worker-1') {
        return Promise.resolve({ user: worker, drive_connection: null, organization_history: [] })
      }
      if (path === '/admin/areas') return Promise.resolve({ data: [{ id: 'area-1', name: 'Sistemas', status: 'active' }] })
      if (path === '/admin/areas/area-1/positions') {
        return Promise.resolve({ data: [{ id: 'pos-1', name: 'Analista', status: 'active' }] })
      }
      return Promise.reject(new Error(`ruta inesperada ${path}`))
    })
  })

  it('muestra los errores del servidor junto a la asignación y conserva el formulario', async () => {
    api.patch.mockRejectedValue({
      message: 'Revise los datos del trabajador.',
      fields: {
        area_id: 'Seleccione un área activa.',
        status: 'Asigne área y cargo antes de activar.',
      },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'María Fernanda' })

    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    expect(await screen.findByText('Seleccione un área activa.')).toBeInTheDocument()
    expect(screen.getByText('Asigne área y cargo antes de activar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Área')).toHaveTextContent('Sistemas')
    expect(screen.getByLabelText('Estado de la cuenta')).toHaveTextContent('Activo')
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/users/worker-1', {
      area_id: 'area-1',
      position_id: 'pos-1',
      status: 'active',
    }))
  })
})
