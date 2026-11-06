import { expect, test } from '@playwright/test'
import { mockPublicSession } from './helpers/mock-public-session'

test('la página de acceso se renderiza sin sesión', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continuar con Google/i })).toBeVisible()
  await expect(page.getByLabel('Usuario')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trabajadores' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
  await expect(page.getByText('Gestión documental', { exact: true })).toBeVisible()
  await expect(page.locator('header').getByText('TERRA', { exact: true })).toBeVisible()
  await expect(page.getByText('Respaldo documental institucional, con trazabilidad y control.')).toHaveCount(0)
  await expect(page.getByText('Acceda al sistema utilizando su cuenta institucional o sus credenciales administrativas.')).toHaveCount(0)
  await expect(page.getByText('Utilice su cuenta personal de Google autorizada por la institución.')).toHaveCount(0)
  await expect(page.getByText('Acceso al sistema mediante credenciales administrativas.')).toHaveCount(0)
  await expect(page.getByPlaceholder('Usuario')).toHaveValue('')
  for (const document of ['Política de privacidad', 'Términos y condiciones', 'Aviso legal', 'Política de cookies']) {
    await expect(page.getByRole('link', { name: document, exact: true })).toBeVisible()
  }
})

test('las rutas legales son públicas, independientes, recargan y navegan', async ({ page, context }) => {
  await mockPublicSession(context)
  const documents = [
    { title: 'Política de privacidad', path: '/politica-de-privacidad' },
    { title: 'Términos y condiciones', path: '/terminos-y-condiciones' },
    { title: 'Aviso legal', path: '/aviso-legal' },
    { title: 'Política de cookies', path: '/politica-de-cookies' },
  ]
  for (const document of documents) {
    await page.goto('/')
    const link = page.getByRole('link', { name: document.title, exact: true })
    await expect(link).toBeVisible()
    await link.click()
    await expect.poll(() => new URL(page.url()).pathname).toBe(document.path)
    await expect(page.getByRole('heading', { name: document.title, level: 1 })).toBeVisible()
    await expect(page.getByText('Documento pendiente de aprobación institucional')).toBeVisible()

    await page.getByRole('link', { name: /Volver al inicio de sesión/i }).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')

    await page.goto(document.path)
    await page.reload()
    await expect(page.getByRole('heading', { name: document.title, level: 1 })).toBeVisible()
    await expect(page.getByText('Documento pendiente de aprobación institucional')).toBeVisible()
  }

  await page.goto('/politica-de-privacidad')
  await page.getByRole('link', { name: 'Términos y condiciones', exact: true }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/terminos-y-condiciones')

  for (const [alias, canonical] of [
    ['/Política-de-privacidad', '/politica-de-privacidad'],
    ['/Términos-y-condiciones', '/terminos-y-condiciones'],
    ['/Aviso-legal', '/aviso-legal'],
    ['/Política-de-cookies', '/politica-de-cookies'],
  ]) {
    await page.goto(alias)
    await expect.poll(() => new URL(page.url()).pathname).toBe(canonical)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
})

test('una ruta inexistente muestra la página 404', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.goto('/ruta-frontend-inexistente')
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Volver al inicio/i })).toBeVisible()
})

test('las páginas legales usan Inter y no desbordan en móvil', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/politica-de-cookies')
  const family = await page.locator('h1').evaluate((element) => getComputedStyle(element).fontFamily)
  expect(family).toContain('Inter')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBeFalsy()
  await expect(page.getByRole('heading', { name: 'Política de cookies', level: 1 })).toBeVisible()
})

test('Inter se carga localmente y se aplica a toda la interfaz', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.goto('/')
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return document.fonts.check('16px Inter')
  })
  expect(loaded).toBeTruthy()
  for (const selector of ['body', 'h1', 'h2', 'input', 'button', 'label']) {
    const family = await page.locator(selector).first().evaluate((element) => getComputedStyle(element).fontFamily)
    expect(family, selector).toContain('Inter')
  }
})

test('el login no desborda horizontalmente en móvil', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBeFalsy()
  await expect(page.getByLabel('Usuario')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
})

test('el login mantiene la jerarquía vertical en todos los anchos', async ({ page, context }) => {
  await mockPublicSession(context)
  for (const width of [1920, 1440, 1366, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
    const workers = await page.getByRole('heading', { name: 'Trabajadores' }).boundingBox()
    const admin = await page.getByRole('heading', { name: 'Administración' }).boundingBox()
    const legal = await page.getByRole('link', { name: 'Política de privacidad' }).boundingBox()
    expect(workers.y, `trabajadores antes que administración a ${width}px`).toBeLessThan(admin.y)
    expect(legal.y, `legal debajo de administración a ${width}px`).toBeGreaterThan(admin.y)
    const { client, scroll } = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    expect(scroll, `desbordamiento a ${width}px`).toBeLessThanOrEqual(client + 1)
  }
})

test('el inicio de OAuth conserva el flujo existente', async ({ request }) => {
  const response = await request.get('/api/v1/auth/google/start', { maxRedirects: 0 })
  expect(response.status()).toBe(302)
  expect(response.headers()['location']).toContain('accounts.google.com')
  expect(response.headers()['location']).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fapi%2Fv1%2Fauth%2Fgoogle%2Fcallback')
})

test('el proxy de Vite entrega la API y protege rutas', async ({ request }) => {
  const health = await request.get('/api/v1/health')
  expect(health.ok()).toBeTruthy()
  expect(await health.json()).toMatchObject({ status: 'ok', service: 'api' })

  const me = await request.get('/api/v1/auth/me')
  expect(me.status()).toBe(401)
})

test('una ruta protegida redirige al acceso', async ({ page, context }) => {
  await mockPublicSession(context)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})
