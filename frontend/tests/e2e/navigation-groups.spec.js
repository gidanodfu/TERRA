import { expect, test } from '@playwright/test'
import {
  ADMIN_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
  WORKER_PERMISSIONS,
} from '../fixtures/permissions'

const users = {
  admin: { id: 'admin-1', display_name: 'Ada Admin', email: 'ada@example.test', status: 'active', roles: ['admin'], area_name: 'Sistemas' },
  moderator: { id: 'mod-1', display_name: 'Marta Moderadora', email: 'marta@example.test', status: 'active', roles: ['moderator'], area_name: 'Sistemas' },
  read_only: { id: 'read-1', display_name: 'Rita Consulta', email: 'rita@example.test', status: 'active', roles: ['read_only'], area_name: 'Sistemas' },
  user: { id: 'user-1', display_name: 'Tra Bajador', email: 'tra@example.test', status: 'active', roles: ['user'], area_name: 'Sistemas' },
}

const permissions = {
  admin: ADMIN_PERMISSIONS,
  moderator: MODERATOR_PERMISSIONS,
  read_only: READ_ONLY_PERMISSIONS,
  user: WORKER_PERMISSIONS,
}

async function mockSession(page, role) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: users[role],
          permissions: permissions[role],
          has_local_credentials: role !== 'user',
          must_rotate_password: false,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/admin/dashboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          active_users: 0, pending_profiles: 0, suspended_users: 0, areas: 0, positions: 0,
          queued_jobs: 0, running_jobs: 0, waiting_authorization_jobs: 0, completed_jobs: 0,
          failed_jobs: 0, stored_bytes: 0, connected_drives: 0, reauth_drives: 0,
          oldest_queue_age_seconds: 0, recent_activity: [], recent_audit: [],
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

async function groupLinks(sidebar, label) {
  const heading = sidebar.getByRole('heading', { name: label })
  await expect(heading).toBeVisible()
  return (await heading.locator('xpath=..').getByRole('link').allTextContents()).map((text) => text.trim())
}

test('el administrador ve las cinco categorías con sus módulos', async ({ page }) => {
  await mockSession(page, 'admin')
  await page.goto('/app/admin')
  const sidebar = page.getByTestId('admin-sidebar')
  expect(await sidebar.getByRole('heading').allTextContents()).toEqual([
    'GENERAL', 'ORGANIZACIÓN', 'GESTIÓN DOCUMENTAL', 'CONTROL INSTITUCIONAL', 'CUENTA Y SEGURIDAD',
  ])
  expect(await groupLinks(sidebar, 'GENERAL')).toEqual(['Dashboard'])
  expect(await groupLinks(sidebar, 'ORGANIZACIÓN')).toEqual(['Trabajadores', 'Áreas y cargos'])
  expect(await groupLinks(sidebar, 'GESTIÓN DOCUMENTAL')).toEqual(['Conexiones Drive', 'Descargas', 'Trabajos', 'Almacenamiento'])
  expect(await groupLinks(sidebar, 'CONTROL INSTITUCIONAL')).toEqual(['Auditoría', 'Política'])
  expect(await groupLinks(sidebar, 'CUENTA Y SEGURIDAD')).toEqual(['Seguridad'])

  const links = await sidebar.getByRole('link').allTextContents()
  expect(new Set(links).size).toBe(links.length)
  expect(await sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('href', '/app/admin')
  expect(await sidebar.getByRole('link', { name: 'Auditoría', exact: true })).toHaveAttribute('href', '/app/admin/audit')
})

test('moderador y solo lectura conservan solo sus grupos y módulos', async ({ page }) => {
  await mockSession(page, 'moderator')
  await page.goto('/app/admin')
  const moderator = page.getByTestId('admin-sidebar')
  expect(await groupLinks(moderator, 'GESTIÓN DOCUMENTAL')).toEqual(['Conexiones Drive', 'Trabajos'])
  expect(await groupLinks(moderator, 'CONTROL INSTITUCIONAL')).toEqual(['Auditoría'])
  await expect(moderator.getByRole('link', { name: 'Descargas' })).toHaveCount(0)
  await expect(moderator.getByRole('link', { name: 'Almacenamiento' })).toHaveCount(0)
  await expect(moderator.getByRole('link', { name: 'Política' })).toHaveCount(0)
  await expect(moderator.getByRole('heading')).toHaveCount(5)

  await page.goto('/app/admin')
  await page.unroute('**/api/v1/**')
  await mockSession(page, 'read_only')
  await page.reload()
  const readOnly = page.getByTestId('admin-sidebar')
  expect(await groupLinks(readOnly, 'GESTIÓN DOCUMENTAL')).toEqual(['Conexiones Drive', 'Trabajos', 'Almacenamiento'])
  expect(await groupLinks(readOnly, 'CONTROL INSTITUCIONAL')).toEqual(['Auditoría'])
  await expect(readOnly.getByRole('link', { name: 'Descargas' })).toHaveCount(0)
  await expect(readOnly.getByRole('link', { name: 'Política' })).toHaveCount(0)
  await expect(readOnly.getByRole('heading')).toHaveCount(5)
})

test('el trabajador ve solo sus tres categorías', async ({ page }) => {
  await mockSession(page, 'user')
  await page.goto('/app')
  const sidebar = page.getByTestId('worker-sidebar')
  expect(await sidebar.getByRole('heading').allTextContents()).toEqual([
    'GENERAL', 'GESTIÓN DOCUMENTAL', 'CUENTA Y SEGURIDAD',
  ])
  expect(await groupLinks(sidebar, 'GENERAL')).toEqual(['Inicio', 'Mi perfil'])
  expect(await groupLinks(sidebar, 'GESTIÓN DOCUMENTAL')).toEqual(['Google Drive', 'Mis descargas', 'Mis documentos'])
  expect(await groupLinks(sidebar, 'CUENTA Y SEGURIDAD')).toEqual(['Seguridad'])
  await expect(sidebar.getByRole('heading', { name: 'ORGANIZACIÓN' })).toHaveCount(0)
})

test('el drawer móvil reutiliza los mismos grupos y cierra al navegar', async ({ page }) => {
  await mockSession(page, 'admin')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/admin')
  await page.getByLabel('Abrir menú').click()
  const drawer = page.getByTestId('admin-drawer')
  expect(await drawer.getByRole('heading').allTextContents()).toEqual([
    'GENERAL', 'ORGANIZACIÓN', 'GESTIÓN DOCUMENTAL', 'CONTROL INSTITUCIONAL', 'CUENTA Y SEGURIDAD',
  ])
  await drawer.getByRole('link', { name: 'Trabajadores', exact: true }).click()
  await expect(page.getByTestId('admin-drawer')).toHaveCount(0)
  await expect(page).toHaveURL(/\/app\/admin\/workers$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('las categorías conservan contraste en claro y True Black', async ({ page }) => {
  await mockSession(page, 'admin')
  await page.goto('/app/admin')
  const heading = page.getByTestId('admin-sidebar').getByRole('heading', { name: 'GENERAL' })
  const light = await heading.evaluate((element) => getComputedStyle(element).color)

  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  const darkHeading = page.getByTestId('admin-sidebar').getByRole('heading', { name: 'GENERAL' })
  await expect(darkHeading).toBeVisible()
  const dark = await darkHeading.evaluate((element) => getComputedStyle(element).color)
  expect(dark).not.toBe(light)
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
})
