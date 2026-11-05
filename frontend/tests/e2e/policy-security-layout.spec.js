import { expect, test } from '@playwright/test'
import { ADMIN_PERMISSIONS } from '../fixtures/permissions'

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin con un nombre institucional razonablemente extenso',
  email: 'ada.admin.institucional@example.test',
  area_name: 'Secretaría de Administración y Finanzas Municipal',
  position_name: 'Administradora de la plataforma documental',
  status: 'active',
  roles: ['admin'],
  last_login_at: '2026-11-05T10:00:00Z',
}

const policy = {
  version: '2026-01',
  published_at: '2026-01-01T10:00:00Z',
  content: [
    'Política institucional aprobada para la gestión documental de TERRA.',
    '',
    'La institución conserva la titularidad de los documentos y define los plazos de retención aplicables.',
    'El consentimiento OAuth no sustituye la aprobación de esta política ni las obligaciones de resguardo.',
    '',
    'Los trabajadores deben aceptar la versión vigente antes de iniciar nuevas descargas.',
  ].join('\n'),
}

async function mockSession(page, { mustRotate = false } = {}) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: adminUser,
          permissions: ADMIN_PERMISSIONS,
          has_local_credentials: true,
          must_rotate_password: mustRotate,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/public/policy')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(policy) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { total: 0 } }),
    })
  })
}

const widths = [1920, 1440, 1366, 1280, 1152, 1024, 960, 768, 390, 360]

async function assertNoDocumentOverflow(page, label) {
  const { client, scroll } = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(scroll, `desbordamiento horizontal en ${label}`).toBeLessThanOrEqual(client + 1)
}

test('Política institucional distribuye versión vigente y publicación en dos columnas', async ({ page }) => {
  await mockSession(page)

  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
    await page.goto('/app/admin/policy')
    await expect(page.getByRole('heading', { name: 'Política institucional', level: 1 })).toBeVisible()
    await assertNoDocumentOverflow(page, `política a ${width}px`)

    const cards = page.locator('main .card')
    await expect(cards).toHaveCount(2)
    const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
    if (width >= 1280) {
      expect(Math.abs(first.y - second.y), `tarjetas apiladas a ${width}px`).toBeLessThanOrEqual(1)
      expect(second.x).toBeGreaterThan(first.x + first.width - 1)
    } else {
      expect(second.y, `tarjetas no apiladas a ${width}px`).toBeGreaterThan(first.y + first.height)
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/app/admin/policy')
  await expect(page.getByRole('heading', { name: 'Versión vigente' })).toBeVisible()
  const content = page.getByLabel('Contenido aprobado')
  const ratio = await content.evaluate((element) => {
    const card = element.closest('.card')
    return element.getBoundingClientRect().width / card.getBoundingClientRect().width
  })
  expect(ratio).toBeGreaterThan(0.8)
  await page.screenshot({ path: '/tmp/terra-policy-1440.png' })

  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/app/admin/policy')
  await expect(page.getByRole('heading', { name: 'Versión vigente' })).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-policy-390.png' })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Versión vigente' })).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-policy-dark-1440.png' })
})

test('Seguridad presenta cuenta y cambio de contraseña en 40/60', async ({ page }) => {
  await mockSession(page, { mustRotate: true })

  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
    await page.goto('/app/security')
    await expect(page.getByRole('heading', { name: 'Seguridad y sesión', level: 1 })).toBeVisible()
    await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()
    await expect(page.getByLabel('Contraseña actual')).toBeVisible()
    await assertNoDocumentOverflow(page, `seguridad a ${width}px`)

    const cards = page.locator('main .card')
    await expect(cards).toHaveCount(2)
    const [account, password] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
    if (width >= 1280) {
      expect(Math.abs(account.y - password.y), `tarjetas apiladas a ${width}px`).toBeLessThanOrEqual(1)
      expect(password.x).toBeGreaterThan(account.x + account.width - 1)
      expect(password.width).toBeGreaterThan(account.width)
    } else {
      expect(password.y, `tarjetas no apiladas a ${width}px`).toBeGreaterThan(account.y + account.height)
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/app/security')
  await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()
  const current = await page.getByLabel('Contraseña actual').boundingBox()
  const next = await page.getByLabel('Nueva contraseña').boundingBox()
  const confirm = await page.getByLabel('Confirmar contraseña').boundingBox()
  expect(Math.abs(next.y - confirm.y)).toBeLessThanOrEqual(1)
  expect(current.width).toBeGreaterThan(next.width)
  expect(Math.abs(next.width - confirm.width)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: '/tmp/terra-security-1440.png' })

  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/app/security')
  await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()
  const smallNext = await page.getByLabel('Nueva contraseña').boundingBox()
  const smallConfirm = await page.getByLabel('Confirmar contraseña').boundingBox()
  expect(smallConfirm.y).toBeGreaterThan(smallNext.y + smallNext.height - 1)
  await page.screenshot({ path: '/tmp/terra-security-390.png' })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.getByText('Debe cambiar su contraseña inicial')).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-security-dark-1440.png' })
})
