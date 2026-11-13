import { expect, test } from '@playwright/test'
import { WORKER_PERMISSIONS } from '../fixtures/permissions'

const worker = {
  id: 'user-1',
  first_name: 'Tra',
  last_name: 'Bajador',
  display_name: 'Tra Bajador',
  email: 'trabajador@example.test',
  area_name: 'Gestión Documental',
  position_name: 'Analista',
  status: 'active',
  roles: ['user'],
}

const job = {
  id: 'job-1',
  status: 'cancel_requested',
  scope_type: 'selected_items',
  total_items: 1,
  completed_items: 0,
  skipped_items: 0,
  failed_items: 0,
  downloaded_bytes: 0,
  total_bytes: 2048,
  created_at: '2026-11-13T10:00:00Z',
  cancel_requested_at: '2026-11-13T10:05:00Z',
  drive_owner_name: worker.display_name,
  requested_by_name: 'Ada Admin',
  area_name: worker.area_name,
  position_name: worker.position_name,
  roots: [],
  file_roots: [],
  progress: {
    stage: 'cancel_requested',
    status: 'cancel_requested',
    byte_progress_percent: 50,
    completed_bytes: 1024,
    in_flight_bytes: 0,
    transferred_bytes: 1024,
    known_total_bytes: 2048,
    unknown_size_items: 0,
    completed_items: 0,
    skipped_items: 0,
    failed_items: 0,
    pending_items: 1,
    retrying_items: 0,
    downloading_items: 0,
    active_downloads: [],
    scan: { folders_discovered: 1, folders_scanned: 1, items_found: 1, downloadable_items: 1, skipped_items: 0 },
  },
}

const jobs = [{ ...job, status: 'completed', progress: { ...job.progress, status: 'completed', byte_progress_percent: 100 } }]

async function mockApi(page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: worker,
          permissions: WORKER_PERMISSIONS,
          has_local_credentials: false,
          must_rotate_password: false,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/download-jobs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: jobs, pagination: { page: 1, page_size: 20, total: 1 } }),
      })
    }
    if (path.endsWith('/download-jobs/job-1')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(job) })
    }
    if (path.endsWith('/download-jobs/job-1/items')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { page: 1, page_size: 25, total: 0 } }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { total: 0 } }),
    })
  })
}

async function openActions(page) {
  const trigger = page.getByRole('button', { name: 'Acciones' })
  await trigger.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  return { trigger, menu }
}

test('el menú de acciones abre, navega y cierra con teclado y fondo', async ({ page }) => {
  await mockApi(page)
  await page.goto('/app/jobs/job-1')
  await expect(page.getByRole('heading', { name: /Trabajo JOB-1/ })).toBeVisible()

  const { trigger, menu } = await openActions(page)
  await expect(menu.getByRole('menuitem', { name: 'Actualizar' })).toBeVisible()
  const disabled = menu.getByRole('menuitem', { name: 'Cancelación solicitada' })
  await expect(disabled).toHaveAttribute('data-disabled')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.mouse.click(4, 4)
  await expect(page.getByRole('menu')).toHaveCount(0)

  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('el menú usa portal y permanece dentro del viewport', async ({ page }) => {
  await mockApi(page)
  for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1280, 800], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/app/jobs/job-1')
    const { menu } = await openActions(page)
    const box = await menu.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
  }
})

test('los selectores filtran y conservan el valor vacío', async ({ page }) => {
  await mockApi(page)
  await page.goto('/app/jobs')
  const trigger = page.getByRole('combobox', { name: 'Filtrar por estado' })
  await expect(trigger).toContainText('Todos los estados')
  await trigger.click()
  await page.getByRole('option', { name: 'Completados' }).click()
  await expect(trigger).toContainText('Completados')
  await trigger.click()
  await page.getByRole('option', { name: 'Todos los estados' }).click()
  await expect(trigger).toContainText('Todos los estados')
})

test('el panel conserva contraste y superficies en True Black', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/app/jobs/job-1')
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  const { menu } = await openActions(page)
  await expect(page.locator('html')).toHaveClass(/dark/)
  const background = await menu.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(background).not.toBe('rgb(255, 255, 255)')
  await expect(menu.getByRole('menuitem', { name: 'Actualizar' })).toBeVisible()
})
