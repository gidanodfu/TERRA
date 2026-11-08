import { expect, test } from '@playwright/test'
import { ADMIN_PERMISSIONS } from '../fixtures/permissions'

const worker = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'Tra',
  last_name: 'Bajador',
  display_name: 'Tra Bajador',
  email: 'worker@example.test',
  area_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  area_name: 'Sistemas',
  position_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position_name: 'Analista',
  status: 'active',
  roles: ['user'],
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: '2026-11-03T12:00:00Z',
}

const principalAdmin = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  area_id: null,
  area_name: '',
  position_id: null,
  position_name: '',
  status: 'active',
  roles: ['admin'],
}

test('Trabajadores excluye al administrador y permite actualizar solo a un trabajador', async ({ page }) => {
  let patchBody = null
  let currentWorker = { ...worker }

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: principalAdmin,
          permissions: ADMIN_PERMISSIONS,
          has_local_credentials: true,
      must_rotate_password: false,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/admin/users')) {
      // El backend ya filtró: el administrador principal no forma parte del listado.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [currentWorker], pagination: { page: 1, page_size: 20, total: 1 } }),
      })
    }
    if (path.endsWith(`/admin/users/${worker.id}`) && request.method() === 'PATCH') {
      patchBody = request.postDataJSON()
      currentWorker = {
        ...currentWorker,
        area_id: patchBody.area_id,
        area_name: 'Área Dos',
        position_id: patchBody.position_id,
        position_name: 'Cargo Dos',
        status: patchBody.status,
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentWorker) })
    }
    if (path.endsWith(`/admin/users/${worker.id}`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: currentWorker, organization_history: [], drive_connection: null }),
      })
    }
    if (path.endsWith('/admin/areas')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sistemas', status: 'active' },
            { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Área Dos', status: 'active' },
          ],
        }),
      })
    }
    if (path.endsWith('/admin/audit-events')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'event-1',
            action: 'admin.user.updated',
            actor_name: 'Ada Admin',
            target_type: 'user',
            target_id: worker.id,
            created_at: '2026-11-03T12:00:00Z',
            metadata: { kind: 'worker', previous_status: 'active', status: 'suspended', result: 'applied' },
          }],
          pagination: { page: 1, page_size: 25, total: 1 },
        }),
      })
    }
    if (/\/admin\/areas\/[^/]+\/positions$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Cargo Dos', status: 'active' }] }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { total: 0 } }),
    })
  })

  await page.goto('/app/admin/workers')
  await expect(page.getByRole('heading', { name: 'Trabajadores', level: 1 })).toBeVisible()
  const workersTable = page.getByRole('table')
  await expect(workersTable.getByText('Tra Bajador')).toBeVisible()
  await expect(workersTable.getByText('Ada Admin')).toHaveCount(0)

  await page.getByRole('link', { name: 'Tra Bajador' }).click()
  await expect(page.getByRole('heading', { name: 'Tra Bajador', level: 1 })).toBeVisible()
  await expect(page.getByText('Modificar asignación')).toBeVisible()
  await expect(page.getByLabel('Área')).toBeVisible()
  await expect(page.getByLabel('Cargo')).toBeVisible()
  await expect(page.getByLabel('Estado de la cuenta')).toBeVisible()

  await page.getByLabel('Área').selectOption('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  await page.getByLabel('Cargo').selectOption('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  await page.getByLabel('Estado de la cuenta').selectOption('suspended')
  await page.getByRole('button', { name: /Guardar cambios/i }).click()

  await expect(page.getByText('Trabajador actualizado.')).toBeVisible()
  expect(patchBody).toEqual({
    area_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    position_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    status: 'suspended',
  })
  await expect(page.locator('dl').getByText('Suspendido')).toBeVisible()

  await page.getByRole('link', { name: 'Auditoría' }).click()
  await expect(page.getByRole('heading', { name: 'Auditoría', level: 1 })).toBeVisible()
  await expect(page.getByText('admin.user.updated')).toBeVisible()
  await page.getByRole('button', { name: 'Ver detalle de Trabajador actualizado' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Trabajador actualizado', level: 2 })).toBeVisible()
  await expect(dialog.getByText('Estado anterior')).toBeVisible()
  await expect(dialog.getByText('Estado actual')).toBeVisible()
  await expect(dialog.getByText('Suspendido')).toBeVisible()
})
