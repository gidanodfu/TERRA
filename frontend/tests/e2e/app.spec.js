import { expect, test } from '@playwright/test'

test('la página de acceso se renderiza sin sesión', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Continuar con Google/i })).toBeVisible()
  await expect(page.getByLabel('Usuario')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trabajadores' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
  await expect(page.getByText('Gestión documental municipal')).toBeVisible()
  await expect(page.getByText('Respaldo documental institucional, con trazabilidad y control.')).toHaveCount(0)
  for (const document of ['Política de privacidad', 'Términos y condiciones', 'Aviso legal', 'Política de cookies']) {
    await expect(page.getByText(document, { exact: true })).toBeVisible()
  }
})

test('Inter se carga localmente y se aplica a toda la interfaz', async ({ page }) => {
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

test('el login no desborda horizontalmente en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBeFalsy()
  await expect(page.getByLabel('Usuario')).toBeVisible()
  await expect(page.getByRole('button', { name: /Entrar como administrador/i })).toBeVisible()
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

test('una ruta protegida redirige al acceso', async ({ page }) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
})
