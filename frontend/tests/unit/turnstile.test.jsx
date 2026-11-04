import { createRef } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Turnstile } from '../../src/features/auth/Turnstile'

vi.mock('../../src/app/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))

let renderMock
let resetMock
let removeMock
let options

beforeEach(() => {
  options = null
  renderMock = vi.fn((_container, widgetOptions) => {
    options = widgetOptions
    return 123
  })
  resetMock = vi.fn()
  removeMock = vi.fn()
  window.turnstile = { render: renderMock, reset: resetMock, remove: removeMock }
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key')
})

afterEach(() => {
  delete window.turnstile
  vi.unstubAllEnvs()
})

async function renderWidget(props = {}) {
  const ref = createRef()
  const onToken = vi.fn()
  const onExpire = vi.fn()
  const view = render(<Turnstile ref={ref} onToken={onToken} onExpire={onExpire} {...props} />)
  await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1))
  return { ref, onToken, onExpire, view, widgetOptions: options }
}

describe('Turnstile', () => {
  it('renderiza una vez, reinicia con el widget existente y elimina al desmontar', async () => {
    const { ref, onToken, view, widgetOptions } = await renderWidget()

    expect(widgetOptions).toMatchObject({
      sitekey: 'test-site-key',
      action: 'admin_login',
      theme: 'light',
    })

    act(() => widgetOptions.callback('token-1'))
    expect(onToken).toHaveBeenLastCalledWith('token-1')

    act(() => ref.current.reset())
    expect(onToken).toHaveBeenLastCalledWith('')
    expect(resetMock).toHaveBeenCalledWith(123)
    expect(renderMock).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(removeMock).toHaveBeenCalledWith(123)
  })

  it('limpia el token y reinicia el widget cuando expira', async () => {
    const { onToken, onExpire, widgetOptions } = await renderWidget()

    act(() => widgetOptions.callback('token-1'))
    act(() => widgetOptions['expired-callback']())

    expect(onToken).toHaveBeenLastCalledWith('')
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(resetMock).toHaveBeenCalledWith(123)
    expect(renderMock).toHaveBeenCalledTimes(1)
  })

  it('invalida el token y permite reintentar tras error-callback', async () => {
    const { onToken, widgetOptions } = await renderWidget()

    act(() => widgetOptions.callback('token-1'))
    act(() => widgetOptions['error-callback']())

    expect(onToken).toHaveBeenLastCalledWith('')
    expect(await screen.findByText('No fue posible cargar la verificación de seguridad.')).toBeInTheDocument()

    act(() => screen.getByRole('button', { name: 'Reintentar verificación' }).click())

    expect(resetMock).toHaveBeenCalledWith(123)
    await waitFor(() =>
      expect(screen.queryByText('No fue posible cargar la verificación de seguridad.')).not.toBeInTheDocument(),
    )
    expect(renderMock).toHaveBeenCalledTimes(1)
  })

  it('no rompe React si reset se invoca antes de tener un widget', async () => {
    renderMock.mockImplementation(() => {
      throw new Error('turnstile unavailable')
    })
    const ref = createRef()
    const onToken = vi.fn()
    render(<Turnstile ref={ref} onToken={onToken} />)

    await screen.findByText('No fue posible cargar la verificación de seguridad.')
    expect(() => act(() => ref.current.reset())).not.toThrow()
    expect(onToken).toHaveBeenLastCalledWith('')
    expect(resetMock).not.toHaveBeenCalled()
  })
})
