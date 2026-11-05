import { expect, test } from '@playwright/test'
import {
  ADMIN_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/permissions'

const accounts = [
  { role: 'admin', permissions: ADMIN_PERMISSIONS },
  { role: 'moderator', permissions: MODERATOR_PERMISSIONS },
  { role: 'read_only', permissions: READ_ONLY_PERMISSIONS },
]

const dashboard = {
  active_users: 0,
  pending_profiles: 0,
  suspended_users: 0,
  areas: 0,
  positions: 0,
  queued_jobs: 0,
  running_jobs: 0,
  waiting_authorization_jobs: 0,
  completed_jobs: 0,
  failed_jobs: 0,
  stored_bytes: 0,
  connected_drives: 0,
  reauth_drives: 0,
  oldest_queue_age_seconds: 0,
  recent_activity: [],
}

// El flujo de login del navegador solo puede ejecutarse en CI simulando Turnstile.
// El contrato real de la respuesta de login se valida en la integración Go.
for (const [index, { role, permissions }] of accounts.entries()) {
  test(`${role}: el formulario de contraseña aparece tras el login sin recargar`, async ({ page }) => {
    const user = {
      id: `11111111-1111-4111-8111-11111111111${index}`,
      first_name: 'Cuenta',
      last_name: role,
      display_name: `Cuenta ${role}`,
      email: `${role}@example.test`,
      area_name: '',
      position_name: '',
      status: 'active',
      roles: [role],
      last_login_at: '2026-11-05T10:00:00Z',
    }
    let loggedIn = false
    let mustRotate = true
    let meAfterLogin = 0

    await page.addInitScript(() => {
      try {
        const loads = Number(sessionStorage.getItem('__terraPageLoads') || 0) + 1
        sessionStorage.setItem('__terraPageLoads', String(loads))
      } catch {
        // about:blank no expone sessionStorage; el marcador se escribe en el origen real.
      }
    })

    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/auth/me')) {
        if (loggedIn) meAfterLogin += 1
        if (!loggedIn) {
          return route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'unauthorized', message: 'No autenticado' } }),
          })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user,
            permissions,
            has_local_credentials: true,
            must_rotate_password: mustRotate,
            pending_profile: false,
          }),
        })
      }
      if (path.endsWith('/auth/admin/login')) {
        loggedIn = true
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user,
            permissions,
            has_local_credentials: true,
            must_rotate_password: true,
            pending_profile: false,
          }),
        })
      }
      if (path.endsWith('/auth/password')) {
        mustRotate = false
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'password_changed' }),
        })
      }
      if (path.endsWith('/admin/dashboard')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(dashboard),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { total: 0 } }),
      })
    })

    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: `
          window.turnstile = {
            render(container, options) { window.__turnstileOptions = options; return 77; },
            reset() {},
            remove() {},
          };
        `,
      }),
    )

    await page.goto('/')
    await page.waitForFunction(() => window.__turnstileOptions?.callback)
    await page.evaluate(() => window.__turnstileOptions.callback('token-login'))

    await page.getByLabel('Usuario').fill(role)
    await page.getByLabel('Contraseña').fill('InicialSegura-123')
    await page.getByRole('button', { name: /Entrar como administrador/i }).click()

    await expect(page).toHaveURL(/\/app\/security$/)
    await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible()
    await expect(page.getByLabel('Contraseña actual')).toBeVisible()

    // apply(data) ya conoce has_local_credentials: no se consulta /auth/me ni se recarga.
    expect(meAfterLogin).toBe(0)
    expect(await page.evaluate(() => sessionStorage.getItem('__terraPageLoads'))).toBe('1')

    await page.getByLabel('Contraseña actual').fill('InicialSegura-123')
    await page.getByLabel('Nueva contraseña').fill('NuevaSegura-456')
    await page.getByLabel('Confirmar contraseña').fill('NuevaSegura-456')
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click()

    await expect(page.getByText(/Contraseña actualizada/)).toBeVisible()
    await expect(page.getByText('Debe cambiar su contraseña inicial')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible()
    await expect(page.getByLabel('Contraseña actual')).toBeVisible()
    expect(meAfterLogin).toBe(1)
    expect(await page.evaluate(() => sessionStorage.getItem('__terraPageLoads'))).toBe('1')

    // Los permisos siguen intactos: el rol puede navegar a su panel.
    await page.goto('/app/admin')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  })
}
