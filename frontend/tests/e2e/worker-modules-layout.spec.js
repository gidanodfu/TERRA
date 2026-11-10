import { expect, test } from '@playwright/test'
import { WORKER_PERMISSIONS } from '../fixtures/permissions'

const worker = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'Tra',
  last_name: 'Bajador',
  display_name: 'Tra Bajador',
  email: 'trabajador@example.test',
  area_name: 'Gestión Documental',
  position_name: 'Analista de archivo institucional',
  status: 'active',
  roles: ['user'],
  last_login_at: '2026-11-05T10:00:00Z',
}

const scopes = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

const connection = {
  status: 'connected',
  google_email: 'trabajador.institucional@example.test',
  connected_at: '2026-10-01T10:00:00Z',
  last_refreshed_at: '2026-11-05T09:00:00Z',
  scopes: scopes.join(' '),
  policy_consent_version: '2026-11',
  policy_consent_at: '2026-11-01T10:00:00Z',
  has_refresh_token: true,
}

const policy = {
  version: '2026-11',
  published_at: '2026-11-01T10:00:00Z',
  content: 'Política institucional de gestión documental. '.repeat(40),
}

const job = (id, status, overrides = {}) => ({
  id,
  status,
  scope_type: 'selected_items',
  total_items: 40,
  completed_items: 18,
  skipped_items: 2,
  failed_items: 1,
  total_bytes: 52428800,
  downloaded_bytes: 20971520,
  progress: {
    stage: status,
    status,
    completed_bytes: 20971520,
    in_flight_bytes: status === 'downloading' ? 1048576 : 0,
    transferred_bytes: 20971520 + (status === 'downloading' ? 1048576 : 0),
    known_total_bytes: 52428800,
    unknown_size_items: 0,
    byte_progress_percent: status === 'completed' ? 100 : 42,
    completed_items: 18,
    skipped_items: 2,
    failed_items: 1,
    pending_items: 19,
    retrying_items: 0,
    downloading_items: status === 'downloading' ? 1 : 0,
    download_speed_bytes_per_second: 1048576,
    average_speed_bytes_per_second: 900000,
    eta_seconds: 30,
    scan: { folders_discovered: 4, folders_scanned: 4, items_found: 40, downloadable_items: 37, skipped_items: 3 },
    active_downloads: status === 'downloading'
      ? [{ item_id: 'active-1', name: 'grande.bin', transferred_bytes: 1048576, expected_bytes: 2097152, progress_percent: 50 }]
      : [],
  },
  created_at: '2026-11-05T10:00:00Z',
  drive_owner_name: worker.display_name,
  requested_by_name: 'Ada Admin',
  area_name: worker.area_name,
  position_name: worker.position_name,
  roots: [{ google_folder_id: 'folder-1', source_path: 'Documentos' }],
  file_roots: [{ google_file_id: 'file-1', source_path: 'Fotografía.dng' }],
  ...overrides,
})

async function mockApi(page, { localCredentials = true, mustRotate = false } = {}) {
  await page.route('**/api/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: worker,
          permissions: WORKER_PERMISSIONS,
          has_local_credentials: localCredentials,
          must_rotate_password: mustRotate,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/me/drive/connection')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connection, policy }),
      })
    }
    if (path.endsWith('/download-jobs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            job('job-aaaaaaaa-1111-4111-8111-111111111111', 'downloading'),
            job('job-bbbbbbbb-2222-4222-8222-222222222222', 'completed', { progress: 100 }),
            job('job-cccccccc-3333-4333-8333-333333333333', 'failed'),
          ],
          pagination: { page: 1, page_size: 20, total: 3 },
        }),
      })
    }
    if (path.endsWith('/download-jobs/job-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(job('job-1', 'downloading')),
      })
    }
    if (path.endsWith('/download-jobs/job-1/items')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'item-1',
            job_id: 'job-1',
            drive_node_id: 'node-1',
            google_file_id: 'file-1',
            stored_file_id: 'stored-file-1',
            name: 'Reporte.pdf',
            mime_type: 'application/pdf',
            status: 'completed',
            attempt_count: 1,
            size_bytes: 2048,
            sha256: 'abcdef0123456789abcdef0123456789',
          }],
          pagination: { page: 1, page_size: 25, total: 1 },
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { total: 0 } }),
    })
  })
}

const widths = [1920, 1648, 1440, 1366, 1280, 1152, 1024, 960, 768, 390, 360]

async function assertNoOverflow(page, label) {
  const { client, scroll } = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(scroll, `desbordamiento en ${label}`).toBeLessThanOrEqual(client + 1)
}

async function scrollTop(page, width, height) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(120)
  await page.evaluate(() => document.querySelector('[data-testid="worker-scroll"]')?.scrollTo(0, 0))
  await page.waitForTimeout(80)
}

test('Google Drive aprovecha el ancho y distribuye política y autorización', async ({ page }) => {
  await mockApi(page)
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/drive')
    await expect(page.getByRole('heading', { name: 'Conexión de Google Drive', level: 1 })).toBeVisible()
    await expect(page.getByText(scopes[0])).toBeVisible()
    await assertNoOverflow(page, `drive a ${width}px`)
  }

  await scrollTop(page, 1440, 1100)
  await page.goto('/app/drive')
  await expect(page.getByRole('heading', { name: 'Política institucional' })).toBeVisible()
  const cards = page.locator('main .card')
  await expect(cards).toHaveCount(3)
  const policyBox = await cards.nth(1).boundingBox()
  const authorizationBox = await cards.nth(2).boundingBox()
  expect(Math.abs(policyBox.y - authorizationBox.y)).toBeLessThanOrEqual(1)
  expect(policyBox.width).toBeGreaterThan(authorizationBox.width)
  await page.screenshot({ path: '/tmp/terra-worker-drive-1440.png' })

  await scrollTop(page, 390, 1400)
  await page.goto('/app/drive')
  await expect(page.getByText(scopes[0])).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-worker-drive-390.png' })

  await scrollTop(page, 1440, 1100)
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Política institucional' })).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-worker-drive-dark-1440.png' })
})

test('el detalle del trabajo permite descargar elementos completados', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/app/jobs/job-1')
  await expect(page.getByRole('heading', { name: /Trabajo JOB-1/, level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Descargar Reporte.pdf' })).toBeVisible()
  await expect(page.getByText('Transferencias activas')).toBeVisible()
  await expect(page.getByText('grande.bin')).toBeVisible()
  await assertNoOverflow(page, 'detalle de trabajo')

  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await assertNoOverflow(page, `detalle de trabajo ${width}`)
  }

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Descargar Reporte.pdf' })).toBeVisible()
  await assertNoOverflow(page, 'detalle de trabajo True Black')
})

test('Mis descargas usa el ancho y conserva filtros y columnas', async ({ page }) => {
  await mockApi(page)
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/jobs')
    await expect(page.getByRole('heading', { name: 'Mis descargas', level: 1 })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Filtrar por estado' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await assertNoOverflow(page, `jobs a ${width}px`)
  }

  await scrollTop(page, 1440, 1000)
  await page.goto('/app/jobs')
  await page.getByRole('combobox', { name: 'Filtrar por estado' }).selectOption('completed')
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-worker-jobs-1440.png' })

  await scrollTop(page, 390, 1200)
  await page.goto('/app/jobs')
  await page.screenshot({ path: '/tmp/terra-worker-jobs-390.png' })

  await scrollTop(page, 1440, 1000)
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-worker-jobs-dark-1440.png' })
})

test('Seguridad distribuye cuenta y protección de sesión', async ({ page }) => {
  await mockApi(page, { localCredentials: false })
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/security')
    await expect(page.getByRole('heading', { name: 'Seguridad y sesión', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Protección de sesión' })).toBeVisible()
    await expect(page.getByLabel('Contraseña actual')).toHaveCount(0)
    await assertNoOverflow(page, `security google a ${width}px`)
  }

  await scrollTop(page, 1440, 1000)
  await page.goto('/app/security')
  const cards = page.locator('main .card')
  await expect(cards).toHaveCount(2)
  const account = await cards.nth(0).boundingBox()
  const protection = await cards.nth(1).boundingBox()
  expect(Math.abs(account.y - protection.y)).toBeLessThanOrEqual(1)
  expect(protection.width).toBeGreaterThan(account.width)
  await page.screenshot({ path: '/tmp/terra-worker-security-1440.png' })

  await scrollTop(page, 390, 1200)
  await page.goto('/app/security')
  await page.screenshot({ path: '/tmp/terra-worker-security-390.png' })

  await scrollTop(page, 1440, 1000)
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Protección de sesión' })).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-worker-security-dark-1440.png' })
})

test('Seguridad mantiene el formulario para credenciales locales', async ({ page }) => {
  await mockApi(page, { localCredentials: true, mustRotate: true })
  await scrollTop(page, 1440, 1000)
  await page.goto('/app/security')
  await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()
  await expect(page.getByLabel('Contraseña actual')).toBeVisible()
  await expect(page.getByLabel('Nueva contraseña')).toBeVisible()
  await expect(page.getByLabel('Confirmar contraseña')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Protección de sesión' })).toHaveCount(0)
  await assertNoOverflow(page, 'security local')
})
