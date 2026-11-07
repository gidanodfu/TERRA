import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProfileForm from '../../src/features/profile/ProfileForm'
import { api } from '../../src/services/api'
import { workerUser } from '../fixtures/users'

vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
  queryString: () => '',
}))

vi.mock('../../src/app/AuthContext', () => ({
  useAuth: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
}))

describe('ProfileForm', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.patch.mockReset()
    api.get.mockImplementation((path) => {
      if (path === '/public/areas') return Promise.resolve({ data: [{ id: 'area-1', name: 'Sistemas' }] })
      if (path === '/public/areas/area-1/positions') return Promise.resolve({ data: [{ id: 'pos-1', name: 'Analista' }] })
      return Promise.reject(new Error(`ruta inesperada ${path}`))
    })
  })

  it('valida campos obligatorios antes de enviar', async () => {
    render(<ProfileForm user={{ ...workerUser, first_name: '', last_name: '', area_id: null, position_id: null }} />)
    fireEvent.click(screen.getByRole('button', { name: /Guardar perfil/i }))
    expect(await screen.findByText('Ingrese sus nombres.')).toBeInTheDocument()
    expect(screen.getByText('Seleccione un área.')).toBeInTheDocument()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('envía el perfil y las relaciones área/cargo', async () => {
    api.patch.mockResolvedValue({ ...workerUser, first_name: 'Ada', last_name: 'Lovelace' })
    render(<ProfileForm user={{ ...workerUser, first_name: '', last_name: '', area_id: null, position_id: null }} />)
    await screen.findByRole('option', { name: 'Sistemas' })
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Lovelace' } })
    fireEvent.change(screen.getByLabelText('Área'), { target: { value: 'area-1' } })
    await screen.findByRole('option', { name: 'Analista' })
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'pos-1' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar perfil/i }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/me/profile', {
      first_name: 'Ada',
      last_name: 'Lovelace',
      area_id: 'area-1',
      position_id: 'pos-1',
    }))
  })

  it('muestra los errores del servidor junto al campo y conserva los datos', async () => {
    api.patch.mockRejectedValue({
      message: 'Revise los campos indicados.',
      fields: { first_name: 'El nombre no es válido.' },
    })
    render(<ProfileForm user={workerUser} />)
    await screen.findByRole('option', { name: 'Sistemas' })
    fireEvent.click(screen.getByRole('button', { name: /Guardar perfil/i }))
    expect(await screen.findByText('El nombre no es válido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombres')).toHaveValue(workerUser.first_name)
    expect(screen.getByLabelText('Apellidos')).toHaveValue(workerUser.last_name)
  })
})
