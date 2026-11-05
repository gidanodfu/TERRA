import { expect, test } from '@playwright/test'

const base = process.env.REAL_E2E_BASE_URL || 'http://127.0.0.1:5173'
const currentPassword = process.env.REAL_E2E_CURRENT_PASSWORD || ''
const newPassword = process.env.REAL_E2E_NEW_PASSWORD || ''

const roleEnv = {
  admin: 'ADMIN',
  moderator: 'MODERATOR',
  read_only: 'READ_ONLY',
}

for (const role of Object.keys(roleEnv)) {
  test(`cambio de contraseña real para ${role}`, async ({ page, context }) => {
    const suffix = roleEnv[role]
    const session = process.env[`REAL_E2E_SESSION_${suffix}`]
    const csrf = process.env[`REAL_E2E_CSRF_${suffix}`]
    test.skip(!session || !csrf || !currentPassword || !newPassword,
      'Requiere REAL_E2E_SESSION_*, REAL_E2E_CSRF_*, REAL_E2E_CURRENT_PASSWORD y REAL_E2E_NEW_PASSWORD')

    await context.addCookies([
      { name: 'terra_session', value: session, url: base },
      { name: 'terra_csrf', value: csrf, url: base },
    ])

    await page.goto(`${base}/app/security`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible()
    await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()

    const before = await page.evaluate(async () => {
      const response = await fetch('/api/v1/auth/me', { credentials: 'include' })
      return { status: response.status, body: await response.json() }
    })
    expect(before.status).toBe(200)
    expect(before.body.has_local_credentials).toBe(true)
    expect(before.body.must_rotate_password).toBe(true)
    expect(before.body.user.roles).toEqual([role])

    await page.getByLabel('Contraseña actual').fill(currentPassword)
    await page.getByLabel('Nueva contraseña').fill(newPassword)
    await page.getByLabel('Confirmar contraseña').fill(newPassword)
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
    await expect(page.getByText(/Contraseña actualizada/)).toBeVisible()
    await expect(page.getByText('Debe cambiar su contraseña inicial')).toHaveCount(0)
    await expect(page.getByLabel('Contraseña actual')).toBeVisible()

    const after = await page.evaluate(async () => {
      const response = await fetch('/api/v1/auth/me', { credentials: 'include' })
      return { status: response.status, body: await response.json() }
    })
    expect(after.status).toBe(200)
    expect(after.body.has_local_credentials).toBe(true)
    expect(after.body.must_rotate_password).toBe(false)
    expect(after.body.user.roles).toEqual([role])
    expect([...after.body.permissions].sort()).toEqual([...before.body.permissions].sort())

    await page.goto(`${base}/app/admin`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  })
}
