import { expect, test } from '@playwright/test'

test.use({ colorScheme: 'light' })

const LEGAL_LINKS = [
  { title: 'Política de privacidad', href: '/politica-de-privacidad' },
  { title: 'Términos y condiciones', href: '/terminos-y-condiciones' },
  { title: 'Aviso legal', href: '/aviso-legal' },
  { title: 'Política de cookies', href: '/politica-de-cookies' },
]

async function mockAnonymous(context) {
  await context.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'unauthorized', message: 'No autenticado' } }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })
}

test('el footer legal distribuye y centra sus elementos', async ({ page }) => {
  await mockAnonymous(page)

  const cases = [
    [1920, 1080, 2],
    [1536, 864, 2],
    [1440, 900, 2],
    [1280, 800, 2],
    [390, 844, 2],
    [360, 640, 2],
    [320, 700, 1],
  ]

  for (const [width, height, columns] of cases) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()

    const footer = page.locator('section').last()
    const metrics = await footer.evaluate((element) => {
      const list = element.querySelector('ul')
      const rect = element.getBoundingClientRect()
      const items = [...list.querySelectorAll('li')].map((item) => {
        const link = item.querySelector('a')
        const itemBox = item.getBoundingClientRect()
        const linkBox = link.getBoundingClientRect()
        return {
          text: link.textContent.trim(),
          href: link.getAttribute('href'),
          itemCenter: itemBox.x + itemBox.width / 2,
          linkCenter: linkBox.x + linkBox.width / 2,
        }
      })
      const heading = element.querySelector('h2')
      const notice = element.querySelector('p')
      return {
        columns: getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean),
        listAlign: getComputedStyle(list).textAlign,
        headingAlign: getComputedStyle(heading).textAlign,
        noticeAlign: getComputedStyle(notice).textAlign,
        footerCenter: rect.x + rect.width / 2,
        items,
      }
    })

    expect(metrics.columns.length, `columnas en ${width}`).toBe(columns)
    if (columns === 2) {
      expect(Math.abs(parseFloat(metrics.columns[0]) - parseFloat(metrics.columns[1])), `columnas desiguales en ${width}`).toBeLessThanOrEqual(1)
    }
    expect(metrics.listAlign).toBe('center')
    expect(metrics.headingAlign).toBe('center')
    expect(metrics.noticeAlign).toBe('center')
    expect(metrics.items.map((item) => item.text)).toEqual(LEGAL_LINKS.map((link) => link.title))
    expect(metrics.items.map((item) => item.href)).toEqual(LEGAL_LINKS.map((link) => link.href))

    for (const item of metrics.items) {
      expect(Math.abs(item.linkCenter - item.itemCenter), `${item.text} descentrado en ${width}`).toBeLessThanOrEqual(1)
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
})

test('los enlaces del footer son accesibles y navegan a sus rutas', async ({ page }) => {
  await mockAnonymous(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')

  const footer = page.locator('section').last()
  const firstLink = footer.getByRole('link', { name: LEGAL_LINKS[0].title })
  await firstLink.hover()
  await expect(firstLink).toHaveCSS('color', 'rgb(6, 95, 70)')

  await firstLink.focus()
  await expect(firstLink).toBeFocused()

  for (const link of LEGAL_LINKS) {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
    await page.locator('section').last().getByRole('link', { name: link.title }).click()
    await expect(page).toHaveURL(new RegExp(`${link.href}$`))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
  }
})
