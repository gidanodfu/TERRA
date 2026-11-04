import { expect, test } from '@playwright/test'

test.use({ colorScheme: 'light' })

const longArea = 'Secretaría de Administración y Finanzas Municipal'
const longPosition = 'Coordinación de Modernización Administrativa, Transparencia y Gobierno Digital'

const workerUser = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'María Fernanda',
  last_name: 'Rodríguez Hernández',
  display_name: 'María Fernanda de los Ángeles Rodríguez Hernández',
  email: 'nombre.apellido.extremadamente.largo@municipio.gob.mx',
  area_id: 'a1',
  area_name: longArea,
  position_id: 'p1',
  position_name: longPosition,
  status: 'active',
  roles: ['user'],
  last_login_at: '2026-11-03T12:00:00Z',
}

const adminUser = {
  ...workerUser,
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  roles: ['admin'],
}

const jobs = Array.from({ length: 18 }, (_, index) => ({
  id: `abcdef${index}12345678`,
  drive_owner_name: workerUser.display_name,
  area_name: longArea,
  position_name: longPosition,
  scope_type: 'selected_folders',
  roots: [{ google_folder_id: `folder-${index}`, source_path: `Documentos / ${longArea}` }],
  status: ['queued', 'downloading', 'completed', 'failed', 'waiting_authorization'][index % 5],
  total_items: 14823,
  completed_items: 9200,
  failed_items: 3,
  skipped_items: 4,
  downloaded_bytes: 9876543210,
  total_bytes: 12345678901,
  created_at: '2026-11-03T12:00:00Z',
  requested_by_name: 'Ada Admin',
}))

const files = Array.from({ length: 8 }, (_, index) => ({
  id: `file-${index}-12345678`,
  name: `informe-ejecutivo-${index}-con-un-nombre-extremadamente-largo-2026.pdf`,
  job_id: `abcdef${index}12345678`,
  area_name: longArea,
  position_name: longPosition,
  owner_name: workerUser.display_name,
  size_bytes: 987654321,
  created_at: '2026-11-03T12:00:00Z',
  export_mime_type: index === 0 ? 'application/vnd.google-apps.document' : null,
}))

const connection = {
  status: 'connected',
  google_email: workerUser.email,
  connected_at: '2026-01-02T10:00:00Z',
  last_refreshed_at: '2026-11-03T12:00:00Z',
  scopes: 'https://www.googleapis.com/auth/drive.readonly',
  has_refresh_token: true,
  policy_consent_version: '2026-01',
  policy_consent_at: '2026-11-03T12:00:00Z',
}

const policy = {
  version: '2026-01',
  published_at: '2026-01-01T10:00:00Z',
  content: 'Política institucional aprobada. '.repeat(40),
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
  const user = getUser()
  if (path.endsWith('/auth/me')) {
    return {
      user,
      permissions: ['admin.dashboard.read'],
      must_rotate_password: false,
      pending_profile: false,
    }
  }
  if (path.endsWith('/admin/dashboard')) return dashboard
  if (path.endsWith('/me/drive/connection')) return { connection, policy }
  if (path.endsWith('/download-jobs') || path.endsWith('/admin/download-jobs')) {
    return { data: jobs, pagination: { total: jobs.length } }
  }
  if (path.endsWith('/me/stored-files') || path.endsWith('/admin/storage')) {
    return { data: files, pagination: { total: files.length } }
  }
  if (path.endsWith('/public/areas')) {
    return { data: [{ id: 'a1', name: longArea, status: 'active' }] }
  }
  if (/\/areas\/[^/]+\/positions$/.test(path)) {
    return { data: [{ id: 'p1', name: longPosition, status: 'active' }] }
  }
  return { data: [], pagination: { total: 0 } }
}

async function mockApi(target, getUser) {
  await target.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payloadFor(route.request().url(), getUser)),
    }),
  )
}

test('el panel del trabajador usa dos superficies homologadas con administración', async ({ page }) => {
  await mockApi(page, () => workerUser)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Hola, María Fernanda' })).toBeVisible()

  const sidebar = page.getByTestId('worker-sidebar')
  const workspace = page.getByTestId('worker-workspace')
  await expect(sidebar).toBeVisible()
  await expect(workspace).toBeVisible()

  const sidebarBox = await sidebar.boundingBox()
  const workspaceBox = await workspace.boundingBox()
  expect(sidebarBox.x).toBeGreaterThan(0)
  expect(sidebarBox.y).toBeGreaterThan(0)
  expect(workspaceBox.x).toBeGreaterThan(sidebarBox.x + sidebarBox.width)
  expect(Math.abs(sidebarBox.y - workspaceBox.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(sidebarBox.height - workspaceBox.height)).toBeLessThanOrEqual(1)
  expect(workspaceBox.x - (sidebarBox.x + sidebarBox.width)).toBeGreaterThanOrEqual(10)

  for (const surface of [sidebar, workspace]) {
    const radius = await surface.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius))
    expect(radius).toBeGreaterThanOrEqual(20)
    expect(await surface.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
  }

  const header = workspace.locator('header').first()
  const headerBox = await header.boundingBox()
  expect(Math.round(headerBox.height)).toBe(64)
  await expect(header).toContainText('Panel del trabajador')
  await expect(header).toContainText('Inicio')
  await expect(header.getByText('Trabajador', { exact: true })).toBeVisible()

  for (const label of ['Inicio', 'Mi perfil', 'Google Drive', 'Mis descargas', 'Mis documentos', 'Seguridad']) {
    await expect(sidebar.getByRole('link', { name: label, exact: true })).toBeVisible()
  }

  const scroll = page.getByTestId('worker-scroll')
  await expect(scroll).toBeVisible()
  expect(await scroll.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto')
  expect(await scroll.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none')
  await expect(sidebar.getByRole('button', { name: 'Activar modo oscuro' })).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900)
})

test('el workspace y la navegación tienen desplazamiento independiente', async ({ page }) => {
  await mockApi(page, () => workerUser)
  await page.setViewportSize({ width: 1440, height: 420 })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Hola, María Fernanda' })).toBeVisible()

  const sidebar = page.getByTestId('worker-sidebar')
  const scroll = page.getByTestId('worker-scroll')
  const header = page.getByTestId('worker-workspace').locator('header').first()

  expect(await scroll.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await scroll.evaluate((element) => element.clientHeight))
  const headerTop = (await header.boundingBox()).y
  const scrolled = await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })
  expect(scrolled).toBeGreaterThan(0)
  expect((await header.boundingBox()).y).toBe(headerTop)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(420)

  const nav = sidebar.locator('nav')
  expect(await nav.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none')
  expect(await nav.evaluate((element) => element.scrollHeight)).toBeGreaterThan(await nav.evaluate((element) => element.clientHeight))
  const navScrolled = await nav.evaluate((element) => {
    element.scrollTop = 80
    return element.scrollTop
  })
  expect(navScrolled).toBeGreaterThan(0)
  await expect(sidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Activar modo oscuro' })).toBeVisible()
})

test('los módulos del trabajador se ejecutan dentro del workspace', async ({ page }) => {
  await mockApi(page, () => workerUser)
  await page.setViewportSize({ width: 1440, height: 900 })

  const modules = [
    ['/app/profile', 'Mi perfil', 'Mi perfil'],
    ['/app/drive', 'Conexión de Google Drive', 'Google Drive'],
    ['/app/jobs', 'Mis descargas', 'Mis descargas'],
    ['/app/documents', 'Mis documentos', 'Mis documentos'],
    ['/app/security', 'Seguridad y sesión', 'Seguridad'],
  ]

  for (const [path, heading, section] of modules) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(page.getByTestId('worker-workspace')).toBeVisible()
    await expect(page.getByTestId('worker-scroll')).toBeVisible()
    const header = page.getByTestId('worker-workspace').locator('header').first()
    await expect(header).toContainText('Panel del trabajador')
    await expect(header).toContainText(section)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900)
  }
})

test('el drawer móvil reutiliza la sidebar y cierra al navegar', async ({ page }) => {
  await mockApi(page, () => workerUser)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Hola, María Fernanda' })).toBeVisible()
  await expect(page.getByTestId('worker-sidebar')).toBeHidden()

  await page.getByLabel('Abrir menú').click()
  const drawer = page.getByTestId('worker-drawer')
  await expect(drawer).toBeVisible()
  for (const label of ['Inicio', 'Mi perfil', 'Google Drive', 'Mis descargas', 'Mis documentos', 'Seguridad']) {
    await expect(drawer.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(drawer.getByRole('button', { name: 'Activar modo oscuro' })).toBeVisible()

  await drawer.getByRole('link', { name: 'Mi perfil', exact: true }).click()
  await expect(page.getByTestId('worker-drawer')).toHaveCount(0)
  await expect(page).toHaveURL(/\/app\/profile$/)
  await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('el layout del trabajador se adapta sin desbordamientos', async ({ page }) => {
  await mockApi(page, () => workerUser)

  const cases = [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 800],
    [1024, 768],
    [900, 800],
    [768, 800],
    [390, 844],
    [360, 800],
    [320, 700],
  ]

  for (const [width, height] of cases) {
    await page.setViewportSize({ width, height })
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Hola, María Fernanda' })).toBeVisible()

    const layout = await page.evaluate(() => {
      const workspace = document.querySelector('[data-testid="worker-workspace"]')
      const scroll = document.querySelector('[data-testid="worker-scroll"]')
      const sidebar = document.querySelector('[data-testid="worker-sidebar"]')
      const workspaceBox = workspace.getBoundingClientRect()
      return {
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        workspaceTop: workspaceBox.top,
        workspaceBottom: workspaceBox.bottom,
        workspaceWidth: workspaceBox.width,
        scrollOverflow: getComputedStyle(scroll).overflowY,
        sidebarDisplay: getComputedStyle(sidebar).display,
      }
    })

    const label = `${width}x${height}`
    expect(layout.documentWidth, `scroll horizontal en ${label}`).toBeLessThanOrEqual(layout.clientWidth)
    expect(layout.documentHeight, `scroll de documento en ${label}`).toBeLessThanOrEqual(layout.clientHeight)
    expect(layout.workspaceTop, `workspace fuera del viewport en ${label}`).toBeGreaterThanOrEqual(0)
    expect(layout.workspaceBottom, `workspace fuera del viewport en ${label}`).toBeLessThanOrEqual(height)
    expect(layout.workspaceWidth, `workspace sin ancho en ${label}`).toBeGreaterThan(0)
    expect(layout.scrollOverflow).toBe('auto')
    if (width >= 768) {
      expect(layout.sidebarDisplay).not.toBe('none')
      await expect(page.getByTestId('worker-sidebar')).toBeVisible()
    } else {
      expect(layout.sidebarDisplay).toBe('none')
      await expect(page.getByTestId('worker-sidebar')).toBeHidden()
    }
  }
})

test('administración conserva su layout de dos superficies', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await mockApi(context, () => adminUser)
  const page = await context.newPage()
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expect(page.getByTestId('admin-sidebar')).toBeVisible()
  await expect(page.getByTestId('admin-workspace')).toBeVisible()
  await expect(page.getByTestId('admin-scroll')).toBeVisible()
  await expect(page.getByTestId('worker-sidebar')).toHaveCount(0)
  await expect(page.getByTestId('worker-workspace')).toHaveCount(0)
  await expect(page.getByTestId('admin-workspace').locator('header').first()).toContainText('Panel administrativo')
  await context.close()
})
