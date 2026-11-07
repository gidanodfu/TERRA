import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SecurityPage from '../../src/pages/worker/SecurityPage'
import { api } from '../../src/services/api'

const auth = vi.hoisted(() => ({
  user: {
    id: 'user-1',
    display_name: 'Cuenta de prueba',
    email: 'cuenta@example.test',
    status: 'active',
    roles: ['moderator'],
    area_name: '',
    position_name: '',
  },
  mustRotate: true,
  hasLocalCredentials: true,
  refresh: vi.fn(),
}))

vi.mock('../../src/app/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../src/services/api', () => ({ api: { post: vi.fn() } }))

function setRole(role, { mustRotate = true, hasLocalCredentials = true } = {}) {
  auth.user = { ...auth.user, roles: [role] }
  auth.mustRotate = mustRotate
  auth.hasLocalCredentials = hasLocalCredentials
}

describe('SecurityPage y credenciales locales', () => {
  beforeEach(() => {
    api.post.mockReset()
    auth.refresh.mockReset()
    setRole('moderator')
  })

  for (const role of ['admin', 'moderator', 'read_only']) {
    it(`muestra el formulario en el primer acceso para ${role}`, () => {
      setRole(role)
      render(<SecurityPage />)
      expect(screen.getByText('Debe cambiar su contraseña inicial')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument()
      expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()
    })
  }

  it('mantiene el formulario después de cambiar la contraseña', () => {
    setRole('read_only', { mustRotate: false, hasLocalCredentials: true })
    render(<SecurityPage />)
    expect(screen.queryByText('Debe cambiar su contraseña inicial')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar contraseña' })).toBeInTheDocument()
  })

  it('no muestra el formulario a una cuenta sin credenciales locales', () => {
    setRole('user', { mustRotate: false, hasLocalCredentials: false })
    render(<SecurityPage />)
    expect(screen.queryByText('Debe cambiar su contraseña inicial')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cambiar contraseña' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña actual')).not.toBeInTheDocument()
  })

  it('envía el cambio y actualiza el contexto', async () => {
    setRole('moderator')
    api.post.mockResolvedValue({ status: 'password_changed' })
    render(<SecurityPage />)
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'InicialSegura-123' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NuevaSegura-456' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'NuevaSegura-456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/password', {
      current_password: 'InicialSegura-123',
      new_password: 'NuevaSegura-456',
    }))
    expect(auth.refresh).toHaveBeenCalled()
    expect(await screen.findByText(/Contraseña actualizada/)).toBeInTheDocument()
  })

  it('valida confirmación y política antes de enviar', async () => {
    setRole('moderator')
    render(<SecurityPage />)
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'InicialSegura-123' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'corta' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'diferente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }))
    expect(await screen.findByText('Use al menos 12 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('asocia el error del servidor al campo y conserva el formulario', async () => {
    setRole('moderator')
    api.post.mockRejectedValue({
      message: 'La contraseña actual no es correcta.',
      fields: { current_password: 'Contraseña incorrecta.' },
    })
    render(<SecurityPage />)
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'InicialSegura-123' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NuevaSegura-456' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'NuevaSegura-456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }))
    expect(await screen.findByText('Contraseña incorrecta.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('NuevaSegura-456')
  })
})
