import { expect, test } from '@playwright/test'
import { selectOption } from './helpers/select'
import { ADMIN_PERMISSIONS, MODERATOR_PERMISSIONS, READ_ONLY_PERMISSIONS, WORKER_PERMISSIONS } from '../fixtures/permissions'

const dashboard = {
  active_users: 2,
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

const principal = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Principal',
  display_name: 'Ada Principal',
  username: 'principal',
  role: 'admin',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: '2026-11-03T12:00:00Z',
  is_principal: true,
  must_rotate_password: false,
}

const moderator = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'Marta',
  last_name: 'Moderadora',
  display_name: 'Marta Moderadora',
  username: 'mmoderadora',
  role: 'moderator',
  status: 'active',
  created_at: '2026-01-02T00:00:00Z',
  last_login_at: null,
  is_principal: false,
  must_rotate_password: true,
}

const worker = {
  id: '33333333-3333-4333-8333-333333333333',
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

function accountUser(role) {
  return {
    id: `${role}-user-1`,
    first_name: 'Usuario',
    last_name: role,
    display_name: `Usuario ${role}`,
    roles: [role],
    status: 'active',
    area_id: null,
    area_name: '',
    position_id: null,
    position_name: '',
    email: '',
  }
}

async function mockApi(page, { user, permissions, accounts = [] }) {
  let accountList = [...accounts]
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user, permissions, has_local_credentials: !user.roles?.includes('user'), must_rotate_password: false, pending_profile: false }),
      })
    }
    if (path.endsWith('/admin/dashboard')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) })
    }
    if (path.endsWith('/admin/accounts') && request.method() === 'POST') {
      const body = request.postDataJSON()
      const created = {
        id: 'new-account-1',
        first_name: body.first_name,
        last_name: body.last_name,
        display_name: `${body.first_name} ${body.last_name}`,
        username: body.username,
        role: body.role,
        status: 'active',
        created_at: '2026-11-05T00:00:00Z',
        last_login_at: null,
        is_principal: false,
        must_rotate_password: true,
      }
      accountList = [created, ...accountList]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    if (path.endsWith('/admin/accounts')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: accountList, pagination: { page: 1, page_size: 20, total: accountList.length } }),
      })
    }
    if (path.endsWith('/admin/users')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [worker], pagination: { page: 1, page_size: 20, total: 1 } }),
      })
    }
    if (path.endsWith(`/admin/users/${worker.id}`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: worker, organization_history: [], drive_connection: null }),
      })
    }
    if (path.endsWith('/admin/areas')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sistemas', status: 'active' }] }),
      })
    }
    if (/\/admin\/areas\/[^/]+\/positions$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Analista', status: 'active' }] }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], pagination: { total: 0 } }) })
  })
}

test('el administrador ve el botón y las pestañas al entrar en trabajadores', async ({ page }) => {
  await mockApi(page, { user: accountUser('admin'), permissions: ADMIN_PERMISSIONS })

  await page.goto('/app/admin/workers')
  await expect(page.getByRole('heading', { name: 'Trabajadores', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nuevo usuario administrativo' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Trabajadores' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Usuarios administrativos' })).toBeVisible()
})

test('un trabajador no accede al módulo administrativo de trabajadores', async ({ page }) => {
  await mockApi(page, { user: worker, permissions: WORKER_PERMISSIONS })

  await page.goto('/app/admin/workers')
  await expect(page.getByText('Acceso no autorizado')).toBeVisible()

  await page.goto('/app/admin/audit')
  await expect(page.getByText('Acceso no autorizado')).toBeVisible()
})

test('el administrador crea una cuenta administrativa y la lista se actualiza', async ({ page }) => {
  await mockApi(page, {
    user: accountUser('admin'), permissions: ADMIN_PERMISSIONS,
    accounts: [principal, moderator],
  })

  await page.goto('/app/admin/workers')
  await page.getByRole('tab', { name: 'Usuarios administrativos' }).click()
  await expect(page.getByText('Administrador principal protegido')).toBeVisible()
  await expect(page.getByText('mmoderadora')).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo usuario administrativo' }).click()
  await selectOption(page, 'Rol administrativo', 'Solo lectura')
  await page.getByLabel('Nombres').fill('Nuevo')
  await page.getByLabel('Apellidos').fill('Usuario')
  await page.getByLabel('Usuario').fill('nuevo.usuario')
  await page.getByLabel('Contraseña', { exact: true }).fill('ClaveSegura-12345')
  await page.getByLabel('Confirmar contraseña').fill('ClaveSegura-12345')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  await expect(page.getByText(/Cuenta creada: nuevo\.usuario/)).toBeVisible()
  await expect(page.getByRole('table').getByText('Nuevo Usuario')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'nuevo.usuario' })).toBeVisible()
  await expect(page.getByText('ClaveSegura-12345')).toHaveCount(0)
})

test('el moderador solo ve los módulos y acciones permitidos', async ({ page }) => {
  await mockApi(page, { user: accountUser('moderator'), permissions: MODERATOR_PERMISSIONS })

  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const moderatorNav = page.getByTestId('admin-sidebar')
  await expect(moderatorNav.getByRole('link', { name: 'Trabajadores' })).toBeVisible()
  await expect(moderatorNav.getByRole('link', { name: 'Trabajos' })).toBeVisible()
  await expect(moderatorNav.getByRole('link', { name: 'Descargas' })).toHaveCount(0)
  await expect(moderatorNav.getByRole('link', { name: 'Almacenamiento' })).toHaveCount(0)
  await expect(moderatorNav.getByRole('link', { name: 'Auditoría' })).toBeVisible()
  await expect(moderatorNav.getByRole('link', { name: 'Política' })).toHaveCount(0)
  for (const label of ['GENERAL', 'ORGANIZACIÓN', 'GESTIÓN DOCUMENTAL', 'CONTROL INSTITUCIONAL', 'CUENTA Y SEGURIDAD']) {
    await expect(moderatorNav.getByRole('heading', { name: label })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'Ver auditoría' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Política institucional' })).toHaveCount(0)

  await page.goto('/app/admin/audit')
  await expect(page.getByRole('heading', { name: 'Auditoría', level: 1 })).toBeVisible()
  await expect(page.getByText(/Auditoría operacional/)).toBeVisible()

  await page.goto('/app/admin/workers')
  await expect(page.getByRole('tab', { name: 'Trabajadores' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Usuarios administrativos' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nuevo usuario administrativo' })).toHaveCount(0)

  await page.goto('/app/admin/policy')
  await expect(page.getByText('Acceso no autorizado')).toBeVisible()
})

test('solo lectura consulta trabajadores sin formularios ni módulos de escritura', async ({ page }) => {
  await mockApi(page, { user: accountUser('read_only'), permissions: READ_ONLY_PERMISSIONS })

  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const readOnlyNav = page.getByTestId('admin-sidebar')
  await expect(readOnlyNav.getByRole('link', { name: 'Almacenamiento' })).toHaveCount(0)
  await expect(readOnlyNav.getByRole('link', { name: 'Auditoría' })).toBeVisible()
  await expect(readOnlyNav.getByRole('link', { name: 'Descargas' })).toHaveCount(0)
  await expect(readOnlyNav.getByRole('link', { name: 'Política' })).toHaveCount(0)
  for (const label of ['GENERAL', 'ORGANIZACIÓN', 'GESTIÓN DOCUMENTAL', 'CONTROL INSTITUCIONAL', 'CUENTA Y SEGURIDAD']) {
    await expect(readOnlyNav.getByRole('heading', { name: label })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'Ver auditoría' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Política institucional' })).toHaveCount(0)

  await page.goto('/app/admin/audit')
  await expect(page.getByText(/Auditoría institucional completa/)).toBeVisible()

  await page.goto('/app/admin/workers')
  await page.getByRole('link', { name: 'Tra Bajador' }).click()
  await expect(page.getByText(/Su rol permite consultar este trabajador/)).toBeVisible()
  await expect(page.getByText('Modificar asignación')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)

  await page.goto('/app/admin/policy')
  await expect(page.getByText('Acceso no autorizado')).toBeVisible()
})
