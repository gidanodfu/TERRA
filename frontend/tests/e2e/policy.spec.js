import { expect, test } from '@playwright/test'

test.use({ colorScheme: 'light' })

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  area_name: 'Secretaría de Administración y Finanzas Municipal',
  position_name: 'Administradora',
  status: 'active',
  roles: ['admin'],
  last_login_at: '2026-11-03T12:00:00Z',
}

const policy = {
  version: '2026-01',
  published_at: '2026-01-01T10:00:00Z',
  content: 'Política institucional aprobada. '.repeat(80),
}

async function mockPolicy(context) {
  await context.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: adminUser,
          permissions: ['admin.policy.read'],
          must_rotate_password: false,
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

test('el contenido aprobado ocupa el ancho de la tarjeta y se comporta como campo', async ({ page }) => {
  await mockPolicy(page)

  for (const [width, height] of [[1440, 900], [1024, 768], [768, 768], [390, 844], [320, 700]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/app/admin/policy')
    await expect(page.getByRole('heading', { name: 'Política institucional', level: 1 })).toBeVisible()

    const version = page.getByLabel('Identificador de versión')
    const content = page.getByLabel('Contenido aprobado')
    await expect(content).toBeVisible()

    const versionBox = await version.boundingBox()
    const contentBox = await content.boundingBox()
    const metrics = await content.evaluate((element) => {
      const style = getComputedStyle(element)
      const card = element.closest('.card')
      const cardBox = card.getBoundingClientRect()
      return {
        width: element.getBoundingClientRect().width,
        cardWidth: cardBox.width,
        right: element.getBoundingClientRect().right,
        cardRight: cardBox.right,
        minHeight: parseFloat(style.minHeight),
        border: parseFloat(style.borderTopWidth),
        radius: parseFloat(style.borderTopLeftRadius),
        resize: style.resize,
        background: style.backgroundColor,
        placeholder: element.getAttribute('placeholder'),
      }
    })

    expect(Math.abs(versionBox.width - contentBox.width), `ancho distinto en ${width}`).toBeLessThanOrEqual(1)
    expect(contentBox.width / metrics.cardWidth, `textarea estrecho en ${width}`).toBeGreaterThan(0.8)
    expect(metrics.right).toBeLessThanOrEqual(metrics.cardRight + 1)
    expect(metrics.minHeight, `altura mínima en ${width}`).toBeGreaterThanOrEqual(180)
    expect(metrics.minHeight).toBeLessThanOrEqual(220)
    expect(metrics.border).toBe(1)
    expect(metrics.radius).toBeGreaterThanOrEqual(12)
    expect(metrics.resize).toBe('vertical')
    expect(metrics.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(metrics.placeholder).toContain('Texto completo de la política institucional')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
})

test('el campo conserva foco verde y permite escribir contenido extenso', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockPolicy(page)
  await page.goto('/app/admin/policy')

  const content = page.getByLabel('Contenido aprobado')
  await content.focus()
  const focusColor = await content.evaluate((element) => getComputedStyle(element).borderTopColor)
  expect(focusColor).toBe('rgb(5, 150, 105)')

  const longText = 'Contenido aprobado de la política institucional. '.repeat(120)
  await content.fill(longText)
  expect(await content.inputValue()).toBe(longText)
  expect(await content.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy()

  await expect(page.getByRole('button', { name: 'Publicar versión' })).toBeEnabled()
})
