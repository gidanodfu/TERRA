import { expect, test } from '@playwright/test'
import { WORKER_PERMISSIONS } from '../fixtures/permissions'
import { selectOption } from './helpers/select'

const worker = {
  id: 'worker-1',
  first_name: 'María Fernanda',
  last_name: 'Rodríguez Hernández',
  display_name: 'María Fernanda Rodríguez Hernández',
  email: 'nombre.apellido.extremadamente.largo@municipio.gob.mx',
  area_id: 'area-1',
  area_name: 'Recursos Humanos',
  position_id: 'position-1',
  position_name: 'Secretaría',
  status: 'active',
  roles: ['user'],
}

async function mockApi(page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: worker,
          permissions: WORKER_PERMISSIONS,
          has_local_credentials: false,
          must_rotate_password: false,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/public/areas')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'area-1', name: 'Recursos Humanos' }, { id: 'area-2', name: 'Sistemas' }] }),
      })
    }
    if (/\/public\/areas\/[^/]+\/positions$/.test(path)) {
      const area = path.split('/').at(-2)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: area === 'area-2'
            ? [{ id: 'position-2', name: 'Analista' }]
            : [{ id: 'position-1', name: 'Secretaría' }],
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { total: 0 } }),
    })
  })
}

test('el perfil aprovecha el ancho y mantiene dos columnas en escritorio', async ({ page }) => {
  await mockApi(page)
  for (const [width, height] of [[1920, 1080], [1440, 900], [1024, 768], [768, 900]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/app/profile')
    await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
    await expect(page.getByText('Datos personales', { exact: true })).toBeVisible()
    await expect(page.getByText('Asignación organizativa', { exact: true })).toBeVisible()

    const metrics = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="worker-scroll"] .card')
      const personal = document.querySelector('[data-testid="profile-personal-section"] .grid')
      const organization = document.querySelector('[data-testid="profile-organization-section"] .grid')
      const main = document.querySelector('[data-testid="worker-scroll"] main')
      return {
        cardWidth: card.getBoundingClientRect().width,
        mainWidth: main.getBoundingClientRect().width,
        cardClass: card.className,
        personalColumns: getComputedStyle(personal).gridTemplateColumns.split(' ').length,
        organizationColumns: getComputedStyle(organization).gridTemplateColumns.split(' ').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })
    expect(metrics.cardClass).not.toContain('max-w-3xl')
    expect(metrics.cardWidth).toBeGreaterThan(metrics.mainWidth * 0.8)
    expect(metrics.personalColumns).toBe(2)
    expect(metrics.organizationColumns).toBe(2)
    expect(metrics.horizontalOverflow).toBeFalsy()
  }
})

test('el perfil usa una columna, conserva etiquetas y dependencia en móvil', async ({ page }) => {
  await mockApi(page)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/app/profile')
    await expect(page.getByLabel('Nombres')).toBeVisible()
    await expect(page.getByLabel('Apellidos')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Área' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Cargo' })).toBeVisible()
    const columns = await page.evaluate(() => {
      const personal = document.querySelector('[data-testid="profile-personal-section"] .grid')
      const organization = document.querySelector('[data-testid="profile-organization-section"] .grid')
      return {
        personal: getComputedStyle(personal).gridTemplateColumns.split(' ').length,
        organization: getComputedStyle(organization).gridTemplateColumns.split(' ').length,
      }
    })
    expect(columns.personal).toBe(1)
    expect(columns.organization).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)

    const cargo = page.getByRole('combobox', { name: 'Cargo' })
    await expect(cargo).not.toBeDisabled()
    await selectOption(page, 'Área', 'Sistemas')
    await expect(cargo).toContainText('Seleccione un cargo')
    await selectOption(page, 'Cargo', 'Analista')
    await expect(cargo).toContainText('Analista')
  }
})

test('la acción de guardado queda alineada y el tema oscuro conserva superficies', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/app/profile')
  const button = page.getByRole('button', { name: 'Guardar perfil' })
  const geometry = await button.evaluate((element) => {
    const card = document.querySelector('[data-testid="worker-scroll"] .card')
    const buttonBox = element.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    return { buttonRight: buttonBox.right, cardRight: cardBox.right, buttonWidth: buttonBox.width }
  })
  expect(Math.abs(geometry.cardRight - geometry.buttonRight)).toBeLessThanOrEqual(40)
  expect(geometry.buttonWidth).toBeLessThan(300)

  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  const background = await page.locator('[data-testid="worker-scroll"] .card').evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(background).not.toBe('rgb(255, 255, 255)')
})
