import { expect, test } from '@playwright/test'
import { mockPublicSession } from './helpers/mock-public-session'

const DOCUMENTS = [
  { title: 'Política de privacidad', path: '/politica-de-privacidad' },
  { title: 'Términos y condiciones', path: '/terminos-y-condiciones' },
  { title: 'Aviso legal', path: '/aviso-legal' },
  { title: 'Política de cookies', path: '/politica-de-cookies' },
]

const widths = [1920, 1648, 1440, 1366, 1024, 768, 390, 360, 320]

test.use({ colorScheme: 'light' })

test('las cuatro páginas comparten navbar, documento, aviso y footer Rounded', async ({ page, context }) => {
  await mockPublicSession(context)

  for (const document of DOCUMENTS) {
    await page.goto(document.path)

    const navbar = page.getByTestId('legal-navbar')
    await expect(navbar.getByText('TERRA', { exact: true })).toBeVisible()
    await expect(navbar.getByText('Gestión documental', { exact: true })).toBeVisible()
    await expect(navbar.getByRole('link', { name: 'Ir al inicio' })).toBeVisible()

    const article = page.getByTestId('legal-document')
    await expect(article.getByRole('heading', { name: document.title, level: 1 })).toBeVisible()
    await expect(article.getByText('Documento pendiente de aprobación institucional')).toBeVisible()
    await expect(article.getByText(/borrador informativo adaptado a TERRA/i)).toBeVisible()
    expect(await article.locator('section').count()).toBeGreaterThanOrEqual(5)
    expect(await article.locator('h2').count()).toBeGreaterThanOrEqual(5)

    const intro = await article.locator('header p').last().textContent()
    expect(intro?.trim().length).toBeGreaterThan(20)
    expect(intro).not.toBe('Información sobre el tratamiento de datos personales en TERRA.')

    const text = await article.textContent()
    for (const forbidden of [
      /postulante/i, /postulaci[oó]n/i, /\bRUC\b/, /curr[ií]culum/i,
      /Unidad Funcional del Empleo/i, /portal de empleo/i, /oferta(s)? laboral/i,
      /MDJLO/i, /Jos[eé] Leonardo Ortiz/i, /\bSOL\b/,
    ]) {
      expect(text, `${document.title} no debe contener ${forbidden}`).not.toMatch(forbidden)
    }
    expect(text).not.toContain('retención automática permanece desactivada')

    await expect(article.getByRole('navigation')).toHaveCount(0)
    await expect(article.getByRole('link', { name: 'Volver al inicio' })).toHaveCount(0)
    await expect(article.getByText('También puede consultar')).toHaveCount(0)
    await expect(article.getByText('Otras secciones legales')).toHaveCount(0)

    const footer = page.getByTestId('legal-footer')
    await expect(footer.getByRole('link')).toHaveCount(4)
    await expect(footer.getByRole('link', { name: document.title })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('TERRA · Gestión documental municipal')).toHaveCount(0)

    const boxes = await Promise.all([navbar.boundingBox(), article.boundingBox(), footer.boundingBox()])
    expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThanOrEqual(1)
    expect(Math.abs(boxes[1].width - boxes[2].width)).toBeLessThanOrEqual(1)
  }
})

test('la navbar vuelve al inicio y el footer enlaza los otros documentos', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.goto('/politica-de-privacidad')

  await page.getByTestId('legal-navbar').getByRole('link', { name: 'Ir al inicio' }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()

  for (const target of DOCUMENTS.filter((document) => document.title !== 'Política de privacidad')) {
    await page.goto('/politica-de-privacidad')
    await page.getByTestId('legal-footer').getByRole('link', { name: target.title }).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe(target.path)
    await expect(page.getByRole('heading', { name: target.title, level: 1 })).toBeVisible()
  }
})

test('la política de cookies y la retención reflejan el comportamiento real', async ({ page, context }) => {
  await mockPublicSession(context)

  await page.goto('/politica-de-cookies')
  const cookies = page.getByTestId('legal-document')
  await expect(cookies.getByText('terra_session (valor predeterminado)')).toBeVisible()
  await expect(cookies.getByText('terra_csrf', { exact: true })).toBeVisible()
  await expect(cookies.getByText('terra_oauth_state', { exact: true })).toBeVisible()
  await expect(cookies.getByText('12 horas por defecto, configurable.')).toBeVisible()
  await expect(cookies.getByText('10 minutos (600 segundos).')).toBeVisible()
  const text = await cookies.textContent()
  for (const expected of ['SESSION_COOKIE_NAME', 'SESSION_TTL_HOURS', 'X-CSRF-Token', 'SameSite=Lax', 'Secure', 'localStorage']) {
    expect(text).toContain(expected)
  }
  expect(text).not.toContain('las cookies son intercambiables')

  await page.goto('/politica-de-privacidad')
  const privacy = page.getByTestId('legal-document')
  await expect(privacy.getByText(/no se identifica un proceso automático de retención/)).toBeVisible()
  await expect(privacy.getByText(/retención automática permanece desactivada/)).toHaveCount(0)
})

test('el footer navega, identifica la página actual y conserva hover/focus', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.goto('/aviso-legal')

  const footer = page.getByTestId('legal-footer')
  const privacy = footer.getByRole('link', { name: 'Política de privacidad' })
  await privacy.hover()
  await expect(privacy).toHaveCSS('color', 'rgb(6, 95, 70)')
  await privacy.focus()
  await expect(privacy).toBeFocused()

  for (const target of DOCUMENTS) {
    await page.goto('/aviso-legal')
    await page.getByTestId('legal-footer').getByRole('link', { name: target.title }).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe(target.path)
    await expect(page.getByTestId('legal-footer').getByRole('link', { name: target.title })).toHaveAttribute('aria-current', 'page')
  }
})

test('las páginas legales no desbordan y respetan el tema oscuro', async ({ page, context }) => {
  await mockPublicSession(context)
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
    await page.goto('/politica-de-privacidad')
    const { client, scroll, columns } = await page.evaluate(() => {
      const footer = document.querySelector('[data-testid="legal-footer"] ul')
      return {
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        columns: getComputedStyle(footer).gridTemplateColumns.split(' ').filter(Boolean).length,
      }
    })
    expect(scroll, `desbordamiento a ${width}px`).toBeLessThanOrEqual(client + 1)
    expect(columns, `columnas del footer a ${width}px`).toBeGreaterThanOrEqual(1)
    expect(columns, `columnas del footer a ${width}px`).toBeLessThanOrEqual(2)
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/politica-de-cookies')
  const light = await page.getByTestId('legal-document').evaluate((element) => getComputedStyle(element).backgroundColor)
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.getByTestId('legal-document')).toBeVisible()
  const dark = await page.getByTestId('legal-document').evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(dark).not.toBe(light)
  expect(dark).not.toBe('rgb(255, 255, 255)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})
