import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkersPage from '../../src/pages/admin/WorkersPage'
import { api } from '../../src/services/api'

const auth = vi.hoisted(() => ({
  can: vi.fn(() => true),
  user: { id: 'actor-1', display_name: 'Actor Admin' },
}))

vi.mock('../../src/app/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  queryString: vi.fn(() => '?page=1'),
}))

const principal = {
  id: 'principal-1',
  first_name: 'Ada',
  last_name: 'Principal',
  display_name: 'Ada Principal',
  username: 'principal',
  role: 'admin',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  is_principal: true,
  must_rotate_password: false,
}

const moderator = {
  id: 'moderator-1',
  first_name: 'Marta',
  last_name: 'Moderadora',
  display_name: 'Marta Moderadora',
  username: 'mmoderadora',
  role: 'moderator',
  status: 'active',
  created_at: '2026-01-02T00:00:00Z',
  is_principal: false,
  must_rotate_password: true,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkersPage />
    </MemoryRouter>,
  )
}

async function openAdministrativeTab() {
  fireEvent.click(screen.getByRole('tab', { name: /Usuarios administrativos/i }))
  expect(await screen.findByText('Marta Moderadora')).toBeInTheDocument()
}

describe('gestión de cuentas administrativas', () => {
  beforeEach(() => {
    auth.can.mockReset()
    auth.can.mockReturnValue(true)
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    api.get.mockResolvedValue({ data: [principal, moderator], pagination: { total: 2 } })
  })

  it('muestra la pestaña y protege al administrador principal', async () => {
    renderPage()
    await openAdministrativeTab()

    expect(screen.getByText('Administrador principal protegido')).toBeInTheDocument()
    expect(screen.getByText('principal')).toBeInTheDocument()
    expect(screen.getByText('mmoderadora')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Desactivar/i })).toHaveLength(1)
  })

  it('valida los campos y la confirmación de contraseña antes de enviar', async () => {
    renderPage()
    await openAdministrativeTab()
    fireEvent.click(screen.getByRole('button', { name: /Nuevo usuario administrativo/i }))

    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))
    expect(await screen.findByText('Ingrese los nombres.')).toBeInTheDocument()
    expect(screen.getByText('Ingrese los apellidos.')).toBeInTheDocument()
    expect(screen.getByText('Ingrese un nombre de usuario.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Nuevo' } })
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Usuario' } })
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'nuevo.usuario' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ClaveSegura-12345' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'OtraClave-12345' } })
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('crea la cuenta, actualiza la lista y no muestra la contraseña', async () => {
    api.post.mockResolvedValue({
      ...moderator,
      id: 'new-1',
      display_name: 'Nuevo Usuario',
      username: 'nuevo.usuario',
      must_rotate_password: true,
    })
    api.get
      .mockResolvedValueOnce({ data: [principal, moderator], pagination: { total: 2 } })
      .mockResolvedValue({ data: [principal, moderator, { ...moderator, id: 'new-1', display_name: 'Nuevo Usuario', username: 'nuevo.usuario' }], pagination: { total: 3 } })

    renderPage()
    await openAdministrativeTab()
    fireEvent.click(screen.getByRole('button', { name: /Nuevo usuario administrativo/i }))

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Nuevo' } })
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Usuario' } })
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'Nuevo.Usuario' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ClaveSegura-12345' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'ClaveSegura-12345' } })
    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/accounts', {
      role: 'moderator',
      first_name: 'Nuevo',
      last_name: 'Usuario',
      username: 'nuevo.usuario',
      password: 'ClaveSegura-12345',
      password_confirmation: 'ClaveSegura-12345',
    }))
    expect(await screen.findByText(/Cuenta creada: nuevo.usuario/)).toBeInTheDocument()
    expect(screen.queryByText('ClaveSegura-12345')).not.toBeInTheDocument()
    expect(await screen.findByText('Nuevo Usuario')).toBeInTheDocument()
  })

  it('permite desactivar una cuenta administrativa con confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.patch.mockResolvedValue({ ...moderator, status: 'disabled' })
    renderPage()
    await openAdministrativeTab()

    fireEvent.click(screen.getByRole('button', { name: /Desactivar/i }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/accounts/moderator-1', { status: 'disabled' }))
    expect(await screen.findByText('Cuenta administrativa desactivada.')).toBeInTheDocument()
  })

  it('oculta la pestaña y el botón de creación sin permisos', async () => {
    auth.can.mockImplementation((permission) => permission === 'admin.users.read')
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/users?page=1'))
    expect(screen.queryByRole('tab', { name: /Usuarios administrativos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nuevo usuario administrativo/i })).not.toBeInTheDocument()
  })
})
