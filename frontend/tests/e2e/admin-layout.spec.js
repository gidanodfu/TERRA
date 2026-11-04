import { expect, test } from '@playwright/test'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  area_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  area_name: 'Sistemas',
  position_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position_name: 'Administradora',
  status: 'active',
  roles: ['admin'],
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

async function mockAdmin(context) {
  await context.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: adminUser,
        permissions: ['admin.dashboard.read'],
        must_rotate_password: false,
        pending_profile: false,
      }),
    }),
  )
  await context.route('**/api/v1/admin/dashboard', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) }),
  )
}

test('el panel administrativo usa dos superficies separadas y rounded', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await mockAdmin(page)
  await page.goto('/app/admin')

  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const sidebar = page.getByTestId('admin-sidebar')
  const workspace = page.getByTestId('admin-workspace')
  await expect(sidebar).toBeVisible()
  await expect(workspace).toBeVisible()
  await expect(sidebar.getByRole('link', { name: 'Trabajadores' })).toBeVisible()
  await expect(sidebar.getByText('Cerrar sesión')).toBeVisible()
  await expect(workspace.locator('header').first()).toContainText('Panel administrativo')

  const sidebarBox = await sidebar.boundingBox()
  const workspaceBox = await workspace.boundingBox()
  expect(sidebarBox.x).toBeGreaterThan(0)
  expect(sidebarBox.y).toBeGreaterThan(0)
  expect(workspaceBox.x).toBeGreaterThan(sidebarBox.x + sidebarBox.width)
  expect(workspaceBox.y).toBeGreaterThan(0)

  for (const surface of [sidebar, workspace]) {
    const radius = await surface.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius))
    expect(radius).toBeGreaterThanOrEqual(20)
  }

  const scroll = page.getByTestId('admin-scroll')
  expect(await scroll.evaluate((element) => element.classList.contains('admin-scroll-container'))).toBeTruthy()
  expect(await scroll.evaluate((element) => getComputedStyle(element).overflowY)).not.toBe('hidden')
  const scrolled = await scroll.evaluate((element) => {
    element.scrollTop = 200
    return element.scrollTop
  })
  expect(scrolled).toBeGreaterThan(0)
})

test('en tablet se mantienen las dos superficies con sidebar reducida', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await mockAdmin(page)
  await page.goto('/app/admin')
  const sidebar = page.getByTestId('admin-sidebar')
  const workspace = page.getByTestId('admin-workspace')
  await expect(sidebar).toBeVisible()
  await expect(workspace).toBeVisible()
  const sidebarBox = await sidebar.boundingBox()
  const workspaceBox = await workspace.boundingBox()
  expect(sidebarBox.x).toBeGreaterThan(0)
  expect(workspaceBox.x).toBeGreaterThan(sidebarBox.x + sidebarBox.width)
  expect(sidebarBox.width).toBeLessThanOrEqual(220)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBeFalsy()
})

test('la navegación administrativa conserva todos los módulos y el drawer móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockAdmin(page)
  await page.goto('/app/admin')
  await expect(page.getByTestId('admin-sidebar')).toBeHidden()

  await page.getByLabel('Abrir menú').click()
  const drawer = page.getByTestId('admin-drawer')
  await expect(drawer).toBeVisible()
  for (const label of ['Dashboard', 'Trabajadores', 'Áreas y cargos', 'Conexiones Drive', 'Descargas', 'Trabajos', 'Almacenamiento', 'Auditoría', 'Política', 'Seguridad']) {
    await expect(drawer.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBeFalsy()
})
