import { expect, test } from '@playwright/test'

test('la página de acceso se renderiza sin sesión', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Continuar con Google/i })).toHaveAttribute(
    'href',
    '/api/v1/auth/google/start',
  )
  await expect(page.getByLabel('Usuario')).toBeVisible()
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
