import { expect, test } from '@playwright/test'
import { ADMIN_PERMISSIONS } from '../fixtures/permissions'

const longArea = 'Secretaría de Administración y Finanzas Municipales'
const longPosition = 'Coordinación de Modernización Administrativa, Transparencia y Gobierno Digital'
const longEmail = 'nombre.apellido.extremadamente.largo@municipio.gob.mx'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  area_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  area_name: longArea,
  position_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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
  email: longEmail,
  position_name: longPosition,
  roles: ['user'],
}

const recentActivity = Array.from({ length: 24 }, (_, index) => ({
  id: `event-${index}`,
  action: `Acción administrativa ${index + 1}`,
  actor_name: 'Ada Admin',
  target_type: 'document',
  target_id: `abcdef${index}12345678`,
  created_at: '2026-11-03T12:00:00Z',
}))

const dashboard = {
  active_users: 1248,
  pending_profiles: 27,
  suspended_users: 13,
  areas: 24,
  positions: 186,
  queued_jobs: 12,
  running_jobs: 7,
  waiting_authorization_jobs: 3,
  completed_jobs: 14444,
  failed_jobs: 29,
  stored_bytes: 9876543210,
  connected_drives: 1123,
  reauth_drives: 9,
  oldest_queue_age_seconds: 36000,
  recent_activity: recentActivity,
}

const adminWorkers = Array.from({ length: 6 }, (_, index) => ({
  id: `33333333-3333-4333-8333-33333333333${index}`,
  display_name: 'María Fernanda de los Ángeles Rodríguez Hernández de la Cruz',
  email: longEmail,
  area_name: longArea,
  position_name: longPosition,
  status: ['active', 'pending_profile', 'suspended'][index % 3],
  last_login_at: '2026-11-03T12:00:00Z',
}))

const workerJobs = Array.from({ length: 5 }, (_, index) => ({
  id: `abcdef${index}12345678`,
  drive_owner_name: workerUser.display_name,
  area_name: longArea,
  position_name: longPosition,
  scope_type: 'selected_folders',
  roots: [{ google_folder_id: `folder-${index}`, source_path: `Documentos / ${longArea}` }],
  status: ['queued', 'downloading', 'completed', 'failed', 'waiting_authorization'][index],
  total_items: 14823,
  completed_items: 9200,
  failed_items: 3,
  skipped_items: 4,
  downloaded_bytes: 9876543210,
  total_bytes: 12345678901,
  created_at: '2026-11-03T12:00:00Z',
  requested_by_name: 'Ada Admin',
}))

const connection = {
  status: 'connected',
  google_email: longEmail,
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
  content: 'Política institucional aprobada. '.repeat(60),
}

function payloadFor(url, asAdmin) {
  const path = new URL(url).pathname
  if (path.endsWith('/auth/me')) {
    return {
      user: asAdmin ? adminUser : workerUser,
      permissions: ADMIN_PERMISSIONS,
      has_local_credentials: asAdmin,
      must_rotate_password: false,
      pending_profile: false,
    }
  }
  if (path.endsWith('/admin/dashboard')) return dashboard
  if (path.endsWith('/admin/users')) return { data: adminWorkers, pagination: { total: 1234 } }
  if (path.endsWith('/admin/areas') || path.endsWith('/public/areas')) {
    return { data: [{ id: 'a1', name: longArea, status: 'active', position_count: 24, user_count: 148 }] }
  }
  if (/\/areas\/[^/]+\/positions$/.test(path)) {
    return { data: [{ id: 'p1', name: longPosition, status: 'active' }] }
  }
  if (path.endsWith('/me/drive/connection')) return { connection, policy }
  if (path.endsWith('/download-jobs') || path.endsWith('/admin/download-jobs')) {
    return { data: workerJobs, pagination: { total: workerJobs.length } }
  }
  if (path.endsWith('/me/stored-files') || path.endsWith('/admin/storage')) {
    return { data: [], pagination: { total: 3 } }
  }
  return { data: [], pagination: { total: 0 } }
}

async function mockApi(context, asAdmin = true) {
  await context.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payloadFor(route.request().url(), asAdmin)),
    }),
  )
}

async function readLayout(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect()
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
    }
    const scroll = document.querySelector('[data-testid="admin-scroll"]')
    const workspace = document.querySelector('[data-testid="admin-workspace"]')
    const sidebar = document.querySelector('[data-testid="admin-sidebar"]')
    const nav = sidebar?.querySelector('nav')
    const doc = document.documentElement
    const lastActivity = [...document.querySelectorAll('[data-testid="admin-scroll"] li')].at(-1)
    const pageHeader = document.querySelector('[data-testid="admin-scroll"] h1')?.parentElement?.parentElement
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
        scrollY: window.scrollY,
      },
      shell: (() => {
        const inner = document.querySelector('#root > div > div')
        return inner ? rect(inner) : null
      })(),
      workspace: workspace ? rect(workspace) : null,
      sidebar: sidebar ? rect(sidebar) : null,
      pageHeaderDirection: pageHeader ? getComputedStyle(pageHeader).flexDirection : null,
      scroll: scroll
        ? {
            ...rect(scroll),
            scrollHeight: scroll.scrollHeight,
            clientHeight: scroll.clientHeight,
            scrollWidth: scroll.scrollWidth,
            clientWidth: scroll.clientWidth,
            overflowY: getComputedStyle(scroll).overflowY,
            scrollbarWidth: getComputedStyle(scroll).scrollbarWidth,
          }
        : null,
      nav: nav
        ? {
            ...rect(nav),
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
            overflowY: getComputedStyle(nav).overflowY,
          }
        : null,
      lastActivity: lastActivity ? rect(lastActivity) : null,
      kpiColumns: (() => {
        const main = document.querySelector('[data-testid="admin-scroll"] main')
        const grid = [...main.querySelectorAll('div')].find((element) => getComputedStyle(element).display === 'grid')
        return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null
      })(),
    }
  })
}

test('el panel administrativo usa dos superficies separadas y rounded', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 })
  await mockApi(page)
  await page.goto('/app/admin')

  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const sidebar = page.getByTestId('admin-sidebar')
  const workspace = page.getByTestId('admin-workspace')
  await expect(sidebar).toBeVisible()
  await expect(workspace).toBeVisible()
  await expect(sidebar.getByRole('link', { name: 'Trabajadores' })).toBeVisible()
  await expect(sidebar.getByText('Cerrar sesión')).toBeVisible()
  await expect(workspace.locator('header').first()).toContainText('Panel administrativo')
  await expect(workspace.locator('header').first()).toContainText('Dashboard')

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

  const layout = await readLayout(page)
  expect(layout.document.scrollHeight).toBeLessThanOrEqual(layout.document.clientHeight)
  expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth)
  expect(layout.scroll.scrollHeight).toBeGreaterThan(layout.scroll.clientHeight)
  expect(layout.scroll.overflowY).not.toBe('hidden')

  const scrolled = await page.getByTestId('admin-scroll').evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })
  expect(scrolled).toBeGreaterThan(0)

  expect(layout.nav.scrollWidth).toBeLessThanOrEqual(layout.nav.clientWidth)
  expect(layout.nav.width).toBeLessThanOrEqual(sidebarBox.width)

  const navScrolled = await sidebar.locator('nav').evaluate((element) => {
    element.scrollTop = 120
    return element.scrollTop
  })
  expect(navScrolled).toBeGreaterThan(0)
})

test('el shell ocupa el ancho disponible y se limita en monitores ultrapanorámicos', async ({ page }) => {
  await mockApi(page)

  for (const [width, height] of [[1920, 1080], [1648, 900], [1536, 864], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/app/admin')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    const layout = await readLayout(page)
    expect(layout.shell.width, `shell estrecho en ${width}`).toBeGreaterThan(width * 0.96)
    expect(layout.shell.left, `margen excesivo en ${width}`).toBeLessThanOrEqual(24)
    expect(layout.workspace.width / layout.shell.width, `workspace desaprovechado en ${width}`).toBeGreaterThan(0.8)
    expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth)
  }

  await page.setViewportSize({ width: 2560, height: 1200 })
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  const layout = await readLayout(page)
  expect(layout.shell.width, 'el shell debe tener un máximo en 2560').toBeLessThanOrEqual(1921)
  expect(layout.shell.left).toBeGreaterThan(200)
  expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth)
})

test('el workspace es el único dueño del scroll en todos los anchos', async ({ page }) => {
  test.setTimeout(60_000)
  const widths = [
    [320, 700], [360, 640], [375, 812], [390, 844], [430, 932], [480, 600],
    [640, 600], [768, 768], [820, 768], [900, 768], [960, 540], [1024, 768],
    [1097, 617], [1180, 768], [1280, 800], [1366, 768], [1440, 900], [1536, 864],
    [1648, 900], [1707, 960], [1745, 982], [1920, 1080],
    [1920, 600], [1280, 600], [1024, 500], [768, 600],
  ]
  await mockApi(page)

  for (const [width, height] of widths) {
    await page.setViewportSize({ width, height })
    await page.goto('/app/admin')
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()

    const layout = await readLayout(page)
    const label = `${width}x${height}`

    expect(layout.document.scrollHeight, `documento scrollea en ${label}`).toBeLessThanOrEqual(layout.document.clientHeight)
    expect(layout.document.scrollWidth, `scroll horizontal en ${label}`).toBeLessThanOrEqual(layout.document.clientWidth)
    expect(layout.workspace.top, `workspace fuera del viewport en ${label}`).toBeGreaterThanOrEqual(0)
    expect(layout.workspace.bottom, `workspace fuera del viewport en ${label}`).toBeLessThanOrEqual(height)
    expect(layout.scroll.scrollHeight, `contenido sin scroll en ${label}`).toBeGreaterThan(layout.scroll.clientHeight)
    expect(layout.scroll.overflowY, label).toBe('auto')

    if (width >= 768) {
      const sidebar = page.getByTestId('admin-sidebar')
      await expect(sidebar).toBeVisible()
      expect(layout.nav.width, `nav desborda sidebar en ${label}`).toBeLessThanOrEqual(layout.sidebar.width)
      expect(layout.nav.right, `nav desborda sidebar en ${label}`).toBeLessThanOrEqual(layout.sidebar.right + 1)
      expect(layout.nav.scrollWidth, `nav con scroll horizontal en ${label}`).toBeLessThanOrEqual(layout.nav.clientWidth)
    } else {
      await expect(page.getByTestId('admin-sidebar')).toBeHidden()
    }

    const headerTop = await page.getByTestId('admin-workspace').locator('header').first().evaluate((element) => element.getBoundingClientRect().top)
    await page.getByTestId('admin-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const after = await readLayout(page)
    expect(after.document.scrollY, `window scrolleó en ${label}`).toBe(0)
    expect(after.lastActivity, `última actividad no alcanzable en ${label}`).toBeTruthy()
    expect(after.lastActivity.bottom, `última actividad recortada en ${label}`).toBeLessThanOrEqual(after.scroll.bottom + 1)
    const headerAfter = await page.getByTestId('admin-workspace').locator('header').first().evaluate((element) => element.getBoundingClientRect().top)
    expect(headerAfter, `header se movió en ${label}`).toBe(headerTop)
  }
})

test('las cuadrículas responden al ancho del workspace, no al del viewport', async ({ page }) => {
  await mockApi(page)

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  expect((await readLayout(page)).kpiColumns).toBe(2)

  await page.setViewportSize({ width: 1180, height: 768 })
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  expect((await readLayout(page)).kpiColumns).toBe(4)

  await page.setViewportSize({ width: 768, height: 768 })
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  expect((await readLayout(page)).kpiColumns).toBe(2)
})

test('PageHeader se apila cuando el workspace es estrecho', async ({ page }) => {
  await mockApi(page)

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  expect((await readLayout(page)).pageHeaderDirection).toBe('row')

  await page.setViewportSize({ width: 900, height: 768 })
  await page.goto('/app/admin')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  expect((await readLayout(page)).pageHeaderDirection).toBe('column')
})

test('la búsqueda y los filtros no colapsan ni desbordan', async ({ page }) => {
  await mockApi(page)

  for (const [width, height] of [[1440, 900], [1024, 768], [768, 768]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/app/admin/workers')
    await expect(page.getByRole('heading', { name: 'Trabajadores', level: 1 })).toBeVisible()

    const input = page.getByPlaceholder('Buscar por nombre o correo')
    const select = page.getByLabel('Filtrar por estado')
    const inputBox = await input.boundingBox()
    const selectBox = await select.boundingBox()
    expect(inputBox.width, `buscador colapsado en ${width}`).toBeGreaterThan(200)
    expect(selectBox.width, `filtro desproporcionado en ${width}`).toBeGreaterThan(150)
    expect(selectBox.width, `filtro desbordado en ${width}`).toBeLessThanOrEqual(500)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
})

test('las tablas largas scrollean dentro de su contenedor', async ({ page }) => {
  await mockApi(page)

  for (const [width, height] of [[320, 700], [390, 844], [768, 768]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/app/admin/workers')
    await expect(page.getByRole('heading', { name: 'Trabajadores', level: 1 })).toBeVisible()

    const wrap = page.locator('.table-wrap')
    await expect(wrap).toBeVisible()
    expect(await wrap.evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto')
    expect(await wrap.evaluate((element) => element.scrollWidth)).toBeGreaterThan(await wrap.evaluate((element) => element.clientWidth))
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

    const scrolled = await wrap.evaluate((element) => {
      element.scrollLeft = 120
      return element.scrollLeft
    })
    expect(scrolled).toBeGreaterThan(0)
  }
})

test('los textos largos del panel del trabajador no desbordan', async ({ page }) => {
  await mockApi(page, false)

  for (const [path, width, height] of [['/app/profile', 320, 700], ['/app/drive', 390, 844], ['/app', 320, 700], ['/app/jobs', 390, 844]]) {
    await page.setViewportSize({ width, height })
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} desborda en ${width}`).toBeLessThanOrEqual(width)
  }
})

test('el modal se limita a la altura y desplaza su contenido', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 })
  await mockApi(page)
  await page.goto('/app/admin/organization')
  await expect(page.getByRole('heading', { name: 'Áreas y cargos', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Nueva área' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const body = page.getByTestId('modal-body')
  await body.evaluate((element) => {
    element.innerHTML = '<div style="height: 900px">Contenido extenso</div>'
  })

  const metrics = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const content = element.querySelector('[data-testid="modal-body"]')
    const footer = element.lastElementChild
    return {
      top: rect.top,
      bottom: rect.bottom,
      maxHeight: getComputedStyle(element).maxHeight,
      bodyOverflow: getComputedStyle(content).overflowY,
      bodyScrollable: content.scrollHeight > content.clientHeight,
      footerVisible: footer.getBoundingClientRect().bottom <= rect.bottom + 1,
    }
  })
  expect(metrics.top).toBeGreaterThanOrEqual(0)
  expect(metrics.bottom).toBeLessThanOrEqual(500)
  expect(metrics.maxHeight).not.toBe('none')
  expect(metrics.bodyOverflow).toBe('auto')
  expect(metrics.bodyScrollable).toBeTruthy()
  expect(metrics.footerVisible).toBeTruthy()

  const scrolled = await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return element.scrollTop
  })
  expect(scrolled).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible()
})

test('la navegación administrativa conserva todos los módulos y el drawer móvil', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await mockApi(page)
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
