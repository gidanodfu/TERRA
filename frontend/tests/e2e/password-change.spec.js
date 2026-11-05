import { expect, test } from '@playwright/test'
import { ADMIN_PERMISSIONS, MODERATOR_PERMISSIONS, READ_ONLY_PERMISSIONS } from '../fixtures/permissions'

const dashboard = {
  active_users: 1, pending_profiles: 0, suspended_users: 0, areas: 1, positions: 1,
  queued_jobs: 0, running_jobs: 0, waiting_authorization_jobs: 0, completed_jobs: 0,
  failed_jobs: 0, stored_bytes: 0, connected_drives: 0, reauth_drives: 0,
  oldest_queue_age_seconds: 0, recent_activity: [],
}

function userFor(role) {
  return {
    id: `${role}-password-test`,
    first_name: 'Cuenta',
    last_name: role,
    display_name: `Cuenta ${role}`,
    email: '',
    area_id: null,
    area_name: '',
    position_id: null,
    position_name: '',
    status: 'active',
    roles: [role],
  }
}

const permissionsFor = {
  admin: ADMIN_PERMISSIONS,
  moderator: MODERATOR_PERMISSIONS,
  read_only: READ_ONLY_PERMISSIONS,
}

for (const role of ['admin', 'moderator', 'read_only']) {
  test(`primer acceso y cambio de contraseña para ${role}`, async ({ page }) => {
    let mustRotate = true
    let passwordBody = null
    const user = userFor(role)
    const permissions = permissionsFor[role]

    await page.route('**/api/v1/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path.endsWith('/auth/me')) {
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
      if (path.endsWith('/auth/password') && request.method() === 'POST') {
        passwordBody = request.postDataJSON()
        mustRotate = false
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'password_changed' }) })
      }
      if (path.endsWith('/admin/dashboard')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], pagination: { total: 0 } }) })
    })

    await page.goto('/app/security')
    await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible()

    await page.getByLabel('Contraseña actual').fill('InicialSegura-123')
    await page.getByLabel('Nueva contraseña').fill('NuevaSegura-456')
    await page.getByLabel('Confirmar contraseña').fill('NuevaSegura-456')
    await page.getByRole('button', { name: 'Actualizar contraseña' }).click()

    await expect(page.getByText(/Contraseña actualizada/)).toBeVisible()
    expect(passwordBody).toEqual({
      current_password: 'InicialSegura-123',
      new_password: 'NuevaSegura-456',
    })
    await expect(page.getByText('Debe cambiar su contraseña inicial')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible()

    await page.goto('/app/admin')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  })
}
