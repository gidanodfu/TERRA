import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/pages/LoginPage'
import { api } from '../../src/services/api'

const auth = vi.hoisted(() => ({
  user: null,
  loading: false,
  apply: vi.fn(),
}))

vi.mock('../../src/app/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../src/services/api', () => ({ api: { post: vi.fn() } }))
vi.mock('../../src/app/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  roles: ['admin'],
  status: 'active',
}

let renderMock
let resetMock
let removeMock
let widgetOptions

beforeEach(() => {
  widgetOptions = null
  renderMock = vi.fn((_container, options) => {
    widgetOptions = options
    return 77
  })
  resetMock = vi.fn()
  removeMock = vi.fn()
  window.turnstile = { render: renderMock, reset: resetMock, remove: removeMock }
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
  auth.user = null
  auth.loading = false
  auth.apply.mockReset()
  api.post.mockReset()
})

afterEach(() => {
  delete window.turnstile
  vi.unstubAllEnvs()
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

async function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <LoginPage />
      <LocationProbe />
    </MemoryRouter>,
  )
  await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1))
  return widgetOptions
}

function fillCredentials(password = 'incorrecta') {
  fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /Entrar como administrador/i }))
}

describe('LoginPage y ciclo de Turnstile', () => {
  it('tras un 401 limpia el token, reinicia el widget y el segundo intento usa token-2', async () => {
    const options = await renderLogin()
    act(() => options.callback('token-1'))
    fillCredentials()

    api.post.mockRejectedValueOnce(new Error('Usuario o contraseña incorrectos.'))
    submit()

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/admin/login', {
        username: 'admin',
        password: 'incorrecta',
        turnstile_token: 'token-1',
      }),
    )
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument()
    await waitFor(() => expect(resetMock).toHaveBeenCalledWith(77))
    expect(renderMock).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Entrar como administrador/i })).not.toBeDisabled(),
    )

    // El token anterior ya no existe: el formulario no puede reenviarse sin verificación.
    submit()
    expect(await screen.findByText('Complete la verificación de seguridad.')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledTimes(1)

    act(() => options.callback('token-2'))
    api.post.mockResolvedValueOnce({
      user: adminUser,
      permissions: ['admin.dashboard.read'],
      must_rotate_password: false,
      pending_profile: false,
    })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'correcta' } })
    submit()

    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/auth/admin/login', {
        username: 'admin',
        password: 'correcta',
        turnstile_token: 'token-2',
      }),
    )
    expect(auth.apply).toHaveBeenCalledWith({
      user: adminUser,
      permissions: ['admin.dashboard.read'],
      must_rotate_password: false,
      pending_profile: false,
    })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/admin'))
    expect(renderMock).toHaveBeenCalledTimes(1)
  })

  it('usa un token nuevo en cada intento fallido consecutivo', async () => {
    const options = await renderLogin()
    fillCredentials()

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      act(() => options.callback(`token-${attempt}`))
      api.post.mockRejectedValueOnce(new Error('Usuario o contraseña incorrectos.'))
      submit()

      await waitFor(() =>
        expect(api.post).toHaveBeenLastCalledWith('/auth/admin/login', {
          username: 'admin',
          password: 'incorrecta',
          turnstile_token: `token-${attempt}`,
        }),
      )
      await waitFor(() => expect(resetMock).toHaveBeenCalledTimes(attempt))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Entrar como administrador/i })).not.toBeDisabled(),
      )
    }

    expect(api.post.mock.calls.map((call) => call[1].turnstile_token)).toEqual(['token-1', 'token-2', 'token-3'])
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(resetMock).toHaveBeenCalledTimes(3)
  })
})
