import { expect, test } from '@playwright/test'

test('el cliente de Vite y React Refresh se sirven como JavaScript', async ({ request }) => {
  const client = await request.get('/@vite/client')
  expect(client.ok()).toBeTruthy()
  expect(client.headers()['content-type']).toContain('javascript')
  const clientBody = await client.text()
  expect(clientBody).toContain('/node_modules/vite/dist/client')
  expect(clientBody.toLowerCase()).not.toContain('<!doctype html')

  const refresh = await request.get('/@react-refresh')
  expect(refresh.ok()).toBeTruthy()
  expect(refresh.headers()['content-type']).toContain('javascript')
  expect(await refresh.text()).toContain('injectIntoGlobalHook')

  for (const path of ['/src/main.jsx', '/src/app/App.jsx', '/src/styles/index.css']) {
    const response = await request.get(path)
    expect(response.ok(), path).toBeTruthy()
    expect(response.headers()['content-type'], path).toContain('javascript')
  }
})

test('React monta la aplicación en #root', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (document.querySelector('#root')?.childElementCount ?? 0) > 0)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  expect(await page.evaluate(() => typeof window.$RefreshReg$)).toBe('function')
})

test('HMR establece la conexión WebSocket de Vite', async ({ page }) => {
  const websocketPromise = page.waitForEvent('websocket', { timeout: 15_000 })
  await page.goto('/')
  const websocket = await websocketPromise
  expect(websocket.url()).toContain('token=')
})
