import { expect, test } from '@playwright/test'
import { ADMIN_PERMISSIONS } from '../fixtures/permissions'
import { formatDateOnly } from '../../src/utils/date-only'

const user = {
  id: 'admin-1',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  status: 'active',
  roles: ['admin'],
  area_name: 'Sistemas',
}

const event = {
  id: 1,
  action: 'download_job.created',
  actor_name: 'Ada Admin',
  target_type: 'download_job',
  target_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  metadata: {},
  created_at: '2026-11-10T15:30:00Z',
}

const job = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  requested_by_name: 'Ada Admin',
  drive_owner_name: 'Tra Bajador',
  area_name: 'Sistemas',
  position_name: 'Analista',
  scope_type: 'my_drive_full',
  status: 'completed',
  total_items: 2,
  completed_items: 2,
  skipped_items: 0,
  failed_items: 0,
  total_bytes: 2048,
  downloaded_bytes: 2048,
  created_at: '2026-11-10T15:30:00Z',
  roots: [],
}

const now = new Date()
const monthKey = formatDateOnly(now).slice(0, 7)
const day = (value) => `${monthKey}-${String(value).padStart(2, '0')}`
const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
const tomorrowKey = formatDateOnly(tomorrow)

async function mockApi(page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/auth/me')) {
      return json({
        user,
        permissions: ADMIN_PERMISSIONS,
        has_local_credentials: true,
        must_rotate_password: false,
        pending_profile: false,
      })
    }
    if (path.endsWith('/admin/audit-events')) {
      return json({ data: [event], pagination: { page: 1, page_size: 25, total: event ? 1 : 0 } })
    }
    if (path.endsWith('/admin/download-jobs')) {
      return json({ data: [job], pagination: { page: 1, page_size: 20, total: 1 } })
    }
    if (path.endsWith('/admin/areas') || path.endsWith('/public/areas')) {
      return json({ data: [{ id: 'area-1', name: 'Sistemas' }] })
    }
    if (/\/areas\/[^/]+\/positions$/.test(path)) {
      return json({ data: [{ id: 'position-1', name: 'Analista' }] })
    }
    return json({ data: [], pagination: { total: 0 } })
  })
}

async function openPicker(page, name) {
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('grid')).toBeVisible()
}

async function pickDay(page, isoDate) {
  await page.locator(`[data-day="${isoDate}"] button`).click()
  await expect(page.getByRole('grid')).toHaveCount(0)
}

function requestsTo(page, suffix) {
  const requests = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.endsWith(suffix)) requests.push(url)
  })
  return requests
}

async function assertPanelInsideViewport(page, width) {
  const panel = page.locator('.terra-date-picker-panel')
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  const wrapper = page.locator('[data-radix-popper-content-wrapper]')
  await expect(wrapper).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  return box
}

test('abre, selecciona, limpia y navega con teclado en Auditoría', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockApi(page)
  const auditRequests = requestsTo(page, '/admin/audit-events')
  await page.goto('/app/admin/audit')
  await expect(page.getByText('Trabajo de descarga creado')).toBeVisible()

  const trigger = page.getByRole('button', { name: 'Desde' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const grid = page.getByRole('grid')
  await expect(grid).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(grid).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(grid).toBeVisible()
  await page.locator(`[data-day="${formatDateOnly(now)}"] button`).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(grid).toHaveCount(0)
  await expect.poll(() => auditRequests.at(-1)?.searchParams.get('from')).toBe(tomorrowKey)
  await expect(trigger).toContainText(
    `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`,
  )

  await openPicker(page, 'Desde')
  await page.getByRole('button', { name: /Limpiar fecha/i }).click()
  await expect.poll(() => auditRequests.at(-1)?.searchParams.has('from')).toBe(false)

  await openPicker(page, 'Hasta')
  const labelBefore = await page.getByRole('grid').getAttribute('aria-label')
  const caption = page.getByRole('status').first()
  await expect(caption).toBeVisible()
  await page.getByRole('button', { name: 'Ir al mes siguiente' }).click()
  await expect(page.getByRole('grid')).not.toHaveAttribute('aria-label', labelBefore)
  await page.getByRole('button', { name: 'Ir al mes anterior' }).click()
  await expect(page.getByRole('grid')).toHaveAttribute('aria-label', labelBefore)

  await pickDay(page, day(20))
  await expect(page.getByRole('button', { name: 'Hasta' })).toContainText('20/')
  await expect.poll(() => auditRequests.at(-1)?.searchParams.get('to')).toBe(day(20))

  await openPicker(page, 'Desde')
  await expect(page.locator(`[data-day="${day(21)}"] button`)).toBeDisabled()
  await expect(page.locator(`[data-day="${day(10)}"] button`)).toBeEnabled()
  const beforeInvalidClick = auditRequests.length
  await page.keyboard.press('Escape')
  expect(auditRequests.length).toBe(beforeInvalidClick)

  await openPicker(page, 'Desde')
  await pickDay(page, day(10))
  await expect.poll(() => auditRequests.at(-1)?.searchParams.get('from')).toBe(day(10))
  await openPicker(page, 'Hasta')
  await expect(page.locator(`[data-day="${day(9)}"] button`)).toBeDisabled()
  await page.getByRole('button', { name: /Limpiar fecha/i }).click()
  await expect.poll(() => auditRequests.at(-1)?.searchParams.has('to')).toBe(false)

  await openPicker(page, 'Desde')
  await page.getByRole('heading', { name: 'Auditoría', level: 1 }).click()
  await expect(page.getByRole('grid')).toHaveCount(0)
})

test('Auditoría y Trabajos usan el mismo calendario en claro y True Black', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockApi(page)
  await page.goto('/app/admin/audit')
  await expect(page.getByText('Trabajo de descarga creado')).toBeVisible()

  await openPicker(page, 'Desde')
  const lightPanel = await page.locator('.terra-date-picker-panel').evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(lightPanel).toBe('rgb(255, 255, 255)')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Activar modo oscuro' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await openPicker(page, 'Desde')
  const colors = await page.evaluate(() => {
    const panel = document.querySelector('.terra-date-picker-panel')
    const dayButton = document.querySelector('.terra-calendar .rdp-day_button')
    return {
      panel: getComputedStyle(panel).backgroundColor,
      dayText: getComputedStyle(dayButton).color,
      panelText: getComputedStyle(document.querySelector('.terra-calendar')).color,
    }
  })
  expect(colors.panel).toBe('rgb(24, 24, 24)')
  expect(colors.panel).not.toBe('rgb(0, 0, 0)')
  expect(await page.locator('.terra-date-picker-panel').isVisible()).toBe(true)
  await page.keyboard.press('Escape')

  await page.goto('/app/admin/jobs')
  await expect(page.getByText('Tra Bajador')).toBeVisible()
  await openPicker(page, 'Desde')
  await pickDay(page, day(12))
  await expect(page.getByRole('button', { name: 'Desde' })).toContainText('12/')
  await page.getByLabel('Buscar trabajos').fill('Ada')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByLabel('Buscar trabajos')).toHaveValue('Ada')

  await page.getByRole('button', { name: 'Activar modo claro' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('el panel no se recorta ni genera scroll horizontal en todos los viewports', async ({ page }) => {
  await mockApi(page)
  for (const width of [320, 390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 700 : 900 })
    await page.goto('/app/admin/audit')
    await expect(page.getByRole('button', { name: 'Desde' })).toBeVisible()
    await openPicker(page, 'Desde')
    await assertPanelInsideViewport(page, width)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('grid')).toHaveCount(0)
  }

  await page.setViewportSize({ width: 320, height: 420 })
  await page.goto('/app/admin/jobs')
  await expect(page.getByRole('button', { name: 'Desde' })).toBeVisible()
  await openPicker(page, 'Desde')
  await assertPanelInsideViewport(page, 320)
})
