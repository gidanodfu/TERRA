import { expect, test } from '@playwright/test'

test.use({ colorScheme: 'light' })

async function mockTurnstile(page) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `
        window.turnstile = {
          render(container, options) {
            window.__turnstileOptions = options;
            if (container) {
              const box = document.createElement('div');
              box.textContent = 'Verificación de seguridad';
              box.style.cssText = 'display:flex;align-items:center;justify-content:center;width:300px;height:65px;border:1px dashed #94a3b8;border-radius:8px;font:12px sans-serif;color:#64748b;background:#f8fafc';
              container.appendChild(box);
            }
            return 1;
          },
          reset() {},
          remove() {},
        };
      `,
    }),
  )
}

test('el login mantiene la jerarquía vertical y no desborda', async ({ page }) => {
  await mockTurnstile(page)

  for (const width of [1920, 1440, 1366, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Trabajadores' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible()
    await expect(page.getByPlaceholder('Usuario')).toHaveValue('')

    const workers = await page.getByRole('heading', { name: 'Trabajadores' }).boundingBox()
    const admin = await page.getByRole('heading', { name: 'Administración' }).boundingBox()
    const legal = await page.getByRole('heading', { name: 'Información legal' }).boundingBox()
    expect(workers.y, `trabajadores antes de administración a ${width}px`).toBeLessThan(admin.y)
    expect(legal.y, `legal debajo de administración a ${width}px`).toBeGreaterThan(admin.y)

    const { client, scroll, cardWidth } = await page.evaluate(() => {
      const card = document.querySelector('main > div > section')
      return {
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        cardWidth: card.getBoundingClientRect().width,
      }
    })
    expect(scroll, `desbordamiento a ${width}px`).toBeLessThanOrEqual(client + 1)
    expect(cardWidth).toBeLessThanOrEqual(460)
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.screenshot({ path: '/tmp/terra-login-1440.png' })

  await page.setViewportSize({ width: 390, height: 1200 })
  await page.goto('/')
  await page.screenshot({ path: '/tmp/terra-login-390.png' })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await page.screenshot({ path: '/tmp/terra-login-dark-1440.png' })
})
