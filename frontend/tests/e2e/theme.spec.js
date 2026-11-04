import { expect, test } from '@playwright/test'

const longArea = 'Secretaría de Administración y Finanzas Municipal'
const longPosition = 'Coordinación de Modernización Administrativa, Transparencia y Gobierno Digital'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  area_id: 'a1',
  area_name: longArea,
  position_id: 'p1',
  position_name: 'Administradora',
  status: 'active',
  roles: ['admin'],
  last_login_at: '2026-11-03T12:00:00Z',
}

const workerUser = {
  ...adminUser,
  id: '22222222-2222-4222-8222-222222222222',
  display_name: 'María Fernanda de los Ángeles Rodríguez Hernández',
  first_name: 'María Fernanda',
  email: 'nombre.apellido.extremadamente.largo@municipio.gob.mx',
  position_name: longPosition,
  roles: ['user'],
}

const workers = Array.from({ length: 4 }, (_, index) => ({
  id: `33333333-3333-4333-8333-33333333333${index}`,
  display_name: 'María Fernanda de los Ángeles Rodríguez Hernández de la Cruz',
  email: 'nombre.apellido.extremadamente.largo@municipio.gob.mx',
  area_name: longArea,
  position_name: longPosition,
  status: 'active',
  last_login_at: '2026-11-03T12:00:00Z',
}))

const connection = {
  status: 'connected',
  google_email: 'nombre.apellido.extremadamente.largo@municipio.gob.mx',
  connected_at: '2026-01-02T10:00:00Z',
  last_refreshed_at: '2026-11-03T12:00:00Z',
  scopes: 'https://www.googleapis.com/auth/drive.readonly',
  has_refresh_token: true,
  policy_consent_version: '2026-01',
}

const policy = {
  version: '2026-01',
  published_at: '2026-01-01T10:00:00Z',
  content: 'Política institucional aprobada. '.repeat(60),
}

const dashboard = {
  active_users: 12,
  pending_profiles: 2,
  suspended_users: 1,
  areas: 4,
  positions: 9,
  queued_jobs: 3,
  running_jobs: 2,
  waiting_authorization_jobs: 1,
  completed_jobs: 44,
  failed_jobs: 2,
  stored_bytes: 2883584,
  connected_drives: 6,
  reauth_drives: 1,
  oldest_queue_age_seconds: 120,
  recent_activity: [],
}

function payloadFor(url, getUser) {
  const path = new URL(url).pathname
  if (path.endsWith('/auth/me')) {
    return {
      user: getUser(),
      permissions: ['admin.dashboard.read'],
      must_rotate_password: false,
      pending_profile: false,
    }
  }
  if (path.endsWith('/admin/dashboard')) return dashboard
  if (path.endsWith('/admin/users')) return { data: workers, pagination: { total: workers.length } }
  if (path.endsWith('/admin/areas') || path.endsWith('/public/areas')) {
    return { data: [{ id: 'a1', name: longArea, status: 'active', position_count: 2, user_count: 4 }] }
  }
  if (/\/areas\/[^/]+\/positions$/.test(path)) return { data: [{ id: 'p1', name: longPosition, status: 'active' }] }
  if (path.endsWith('/public/policy')) return policy
  if (path.endsWith('/me/drive/connection')) return { connection, policy }
  if (path.endsWith('/download-jobs') || path.endsWith('/admin/download-jobs')) {
    return { data: [], pagination: { total: 0 } }
  }
  if (path.endsWith('/me/stored-files') || path.endsWith('/admin/storage')) {
    return { data: [], pagination: { total: 0 } }
  }
  return { data: [], pagination: { total: 0 } }
}

async function mockApi(context, getUser) {
  await context.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payloadFor(route.request().url(), getUser)),
    }),
  )
}

function luminance(color) {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0]
  const linear = channels.map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(first, second) {
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test('el tema oscuro se activa desde administración, persiste y se comparte con el trabajador', async ({ page }) => {
  let currentUser = adminUser
  await mockApi(page, () => currentUser)
  await page.goto('/app/admin')

  const toggle = page.getByRole('button', { name: 'Activar modo oscuro' })
  await expect(toggle).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await toggle.click()
  await expect(page.getByRole('button', { name: 'Activar modo claro' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await page.evaluate(() => localStorage.getItem('terra-theme'))).toBe('dark')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')

  const inactiveNav = page.locator('[data-testid="admin-sidebar"] nav a').nth(1)
  await expect(inactiveNav).toHaveCSS('color', 'rgb(199, 210, 224)')

  const darkColors = await page.evaluate(() => {
    const workspace = document.querySelector('[data-testid="admin-workspace"]')
    const nav = document.querySelector('[data-testid="admin-sidebar"] nav a:not([aria-current])')
    return {
      body: getComputedStyle(document.body).backgroundColor,
      workspace: getComputedStyle(workspace).backgroundColor,
      navText: getComputedStyle(nav).color,
      navBackground: getComputedStyle(document.querySelector('[data-testid="admin-sidebar"]')).backgroundColor,
      heading: getComputedStyle(document.querySelector('h1')).color,
    }
  })
  expect(luminance(darkColors.body)).toBeLessThan(0.05)
  expect(luminance(darkColors.workspace)).toBeLessThan(0.1)
  expect(luminance(darkColors.heading)).toBeGreaterThan(0.7)
  expect(contrast(darkColors.navText, darkColors.navBackground)).toBeGreaterThanOrEqual(4.5)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Activar modo claro' })).toBeVisible()

  await page.goto('/app/admin/workers')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Activar modo claro' })).toBeVisible()

  // La preferencia sobrevive al cerrar sesión y volver a entrar en el mismo navegador.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await page.evaluate(() => localStorage.getItem('terra-theme'))).toBe('dark')

  currentUser = workerUser
  await page.goto('/app')
  await expect(page.locator('html')).toHaveClass(/dark/)
  const workerToggle = page.getByRole('button', { name: 'Activar modo claro' })
  await expect(workerToggle).toBeVisible()
  await workerToggle.click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  expect(await page.evaluate(() => localStorage.getItem('terra-theme'))).toBe('light')
})

test('sin preferencia se usa inicialmente el tema del sistema', async ({ browser }) => {
  const darkContext = await browser.newContext({ colorScheme: 'dark' })
  await mockApi(darkContext, () => adminUser)
  const darkPage = await darkContext.newPage()
  await darkPage.goto('/app/admin')
  await expect(darkPage.locator('html')).toHaveClass(/dark/)
  expect(await darkPage.evaluate(() => localStorage.getItem('terra-theme'))).toBeNull()
  await darkContext.close()

  const lightContext = await browser.newContext({ colorScheme: 'light' })
  await mockApi(lightContext, () => adminUser)
  const lightPage = await lightContext.newPage()
  await lightPage.goto('/app/admin')
  await expect(lightPage.locator('html')).not.toHaveClass(/dark/)
  expect(await lightPage.evaluate(() => localStorage.getItem('terra-theme'))).toBeNull()
  await lightContext.close()
})

test('el selector es cuadrado, accesible y comparte fila con cerrar sesión en ambas sidebars', async ({ page }) => {
  let currentUser = adminUser
  await mockApi(page, () => currentUser)
  await page.goto('/app/admin')

  for (const surface of ['admin', 'worker']) {
    if (surface === 'worker') {
      currentUser = workerUser
      await page.goto('/app')
    }
    const toggle = page.getByRole('button', { name: 'Activar modo oscuro' })
    const logout = page.getByRole('button', { name: 'Cerrar sesión' })
    await expect(toggle).toBeVisible()
    await expect(logout).toBeVisible()

    const toggleBox = await toggle.boundingBox()
    const logoutBox = await logout.boundingBox()
    expect(toggleBox.width).toBeGreaterThanOrEqual(40)
    expect(toggleBox.width).toBeLessThanOrEqual(44)
    expect(Math.abs(toggleBox.height - toggleBox.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(toggleBox.y - logoutBox.y)).toBeLessThanOrEqual(1)
    expect(toggleBox.x).toBeGreaterThan(logoutBox.x + logoutBox.width)
    expect(toggleBox.x - (logoutBox.x + logoutBox.width)).toBeGreaterThanOrEqual(6)

    await toggle.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Activar modo oscuro')
    await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1')
  }
})

test('modales, tablas, formularios y controles adoptan superficies oscuras', async ({ page }) => {
  await mockApi(page, () => adminUser)
  await page.goto('/app/admin')
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.goto('/app/admin/workers')
  await expect(page.getByLabel('Buscar trabajadores')).toBeVisible()
  await expect(page.getByLabel('Filtrar por estado')).toBeVisible()
  await expect(page.locator('table tbody tr').first()).toBeVisible()
  const surfaces = await page.evaluate(() => {
    const tableHead = document.querySelector('table thead')
    const input = document.querySelector('input[aria-label="Buscar trabajadores"]')
    const select = document.querySelector('select[aria-label="Filtrar por estado"]')
    return {
      tableHead: getComputedStyle(tableHead).backgroundColor,
      row: getComputedStyle(document.querySelector('table tbody')).backgroundColor,
      input: getComputedStyle(input).backgroundColor,
      inputText: getComputedStyle(input).color,
      selectScheme: getComputedStyle(select).colorScheme,
    }
  })
  expect(luminance(surfaces.tableHead)).toBeLessThan(0.05)
  expect(luminance(surfaces.row)).toBeLessThan(0.1)
  expect(luminance(surfaces.input)).toBeLessThan(0.05)
  expect(luminance(surfaces.inputText)).toBeGreaterThan(0.7)
  expect(surfaces.selectScheme).toBe('dark')

  await page.goto('/app/admin/organization')
  await expect(page.getByRole('heading', { name: 'Áreas y cargos', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Nueva área' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const dialogColors = await dialog.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    body: getComputedStyle(element.querySelector('[data-testid="modal-body"]')).backgroundColor,
    text: getComputedStyle(element.querySelector('h2')).color,
  }))
  expect(luminance(dialogColors.background)).toBeLessThan(0.1)
  expect(luminance(dialogColors.body)).toBeLessThan(0.1)
  expect(luminance(dialogColors.text)).toBeGreaterThan(0.7)

  await page.goto('/app/admin/policy')
  await expect(page.getByRole('heading', { name: 'Política institucional', level: 1 })).toBeVisible()
  const textarea = page.getByLabel('Contenido aprobado')
  await expect(textarea).toBeVisible()
  const textareaColors = await textarea.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
    border: getComputedStyle(element).borderTopColor,
  }))
  expect(luminance(textareaColors.background)).toBeLessThan(0.05)
  expect(luminance(textareaColors.text)).toBeGreaterThan(0.7)
  expect(luminance(textareaColors.border)).toBeGreaterThan(0.02)
})
