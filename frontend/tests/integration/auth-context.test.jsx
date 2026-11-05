import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../src/app/AuthContext'
import { api } from '../../src/services/api'
import { meResponse } from '../fixtures/users'

vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

function AuthProbe() {
  const auth = useAuth()
  if (auth.loading) return <p>cargando</p>
  if (!auth.user) return <p>sin sesión</p>
  return (
    <div>
      <p>{auth.user.display_name}</p>
      <p>{auth.isAdmin ? 'admin' : 'worker'}</p>
      <p>{auth.isAdministrative ? 'administrativa' : 'no administrativa'}</p>
      <p>{auth.isWorker ? 'trabajador' : 'no trabajador'}</p>
      <p>{auth.hasLocalCredentials ? 'credenciales locales' : 'sin credenciales locales'}</p>
      <p>{auth.can('admin.dashboard.read') ? 'puede dashboard' : 'sin permiso'}</p>
      <button type="button" onClick={auth.logout}>salir</button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('carga la sesión, permisos y rol administrativo', async () => {
    api.get.mockResolvedValue(meResponse)
    render(<AuthProvider><AuthProbe /></AuthProvider>)
    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('administrativa')).toBeInTheDocument()
    expect(screen.getByText('no trabajador')).toBeInTheDocument()
    expect(screen.getByText('credenciales locales')).toBeInTheDocument()
    expect(screen.getByText('puede dashboard')).toBeInTheDocument()
  })

  it('cierra sesión y limpia el estado', async () => {
    api.get.mockResolvedValue(meResponse)
    api.post.mockResolvedValue({ status: 'logged_out' })
    render(<AuthProvider><AuthProbe /></AuthProvider>)
    await screen.findByText('Ada Admin')
    fireEvent.click(screen.getByText('salir'))
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument())
    expect(api.post).toHaveBeenCalledWith('/auth/logout')
  })

  it('limpia la sesión ante 401', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('no'), { status: 401 }))
    render(<AuthProvider><AuthProbe /></AuthProvider>)
    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
  })
})
