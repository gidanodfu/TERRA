import { expect, test } from '@playwright/test'
import { ADMIN_PERMISSIONS } from '../fixtures/permissions'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  area_id: 'a1',
  area_name: 'Sistemas',
  position_id: 'p1',
  position_name: 'Administradora',
  status: 'active',
  roles: ['admin'],
  last_login_at: '2026-11-03T12:00:00Z',
}

const dashboard = {
  active_users: 1,
  pending_profiles: 0,
  suspended_users: 0,
  areas: 1,
  positions: 1,
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

test('contraseña incorrecta reinicia Turnstile y el segundo intento usa un token nuevo', async ({ page }) => {
  const loginBodies = []
  let loginAttempts = 0

  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'unauthorized', message: 'No autenticado' } }),
      })
    }
    if (path.endsWith('/auth/admin/login')) {
      loginBodies.push(route.request().postDataJSON())
      loginAttempts += 1
      if (loginAttempts === 1) {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'invalid_credentials', message: 'Usuario o contraseña incorrectos.' },
          }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: adminUser,
          permissions: ADMIN_PERMISSIONS,
          must_rotate_password: false,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/admin/dashboard')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) })
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
          render(container, options) {
            window.__turnstileOptions = options;
            window.__turnstileRenderCount = (window.__turnstileRenderCount || 0) + 1;
            window.__turnstileWidgetId = 77;
            return 77;
          },
          reset(id) {
            window.__turnstileResetCount = (window.__turnstileResetCount || 0) + 1;
            window.__turnstileResetId = id;
          },
          remove() {},
        };
      `,
    }),
  )

  await page.goto('/')
  await page.waitForFunction(() => window.__turnstileOptions?.callback)
  await page.evaluate(() => window.__turnstileOptions.callback('token-1'))

  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña').fill('incorrecta')
  await page.getByRole('button', { name: /Entrar como administrador/i }).click()

  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
  await expect.poll(() => loginBodies.length).toBe(1)
  expect(loginBodies[0].turnstile_token).toBe('token-1')
  expect(loginBodies[0].username).toBe('admin')
  await expect.poll(() => page.evaluate(() => window.__turnstileResetCount)).toBe(1)
  expect(await page.evaluate(() => window.__turnstileResetId)).toBe(77)
  expect(await page.evaluate(() => window.__turnstileRenderCount)).toBe(1)
  expect(new URL(page.url()).pathname).toBe('/')

  // El token anterior ya no puede reutilizarse.
  await page.getByRole('button', { name: /Entrar como administrador/i }).click()
  await expect(page.getByText('Complete la verificación de seguridad.')).toBeVisible()
  await expect.poll(() => loginBodies.length).toBe(1)

  // Nuevo token tras la nueva verificación.
  await page.evaluate(() => window.__turnstileOptions.callback('token-2'))
  await page.getByLabel('Contraseña').fill('correcta')
  await page.getByRole('button', { name: /Entrar como administrador/i }).click()

  await expect(page).toHaveURL(/\/app\/admin$/)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expect.poll(() => loginBodies.length).toBe(2)
  expect(loginBodies[1].turnstile_token).toBe('token-2')
  expect(loginBodies[1].password).toBe('correcta')
  expect(await page.evaluate(() => window.__turnstileRenderCount)).toBe(1)
})
