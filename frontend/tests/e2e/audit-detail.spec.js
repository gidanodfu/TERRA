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

const operatorEvent = {
  id: 1,
  action: 'auth.admin.login',
  actor_name: 'Ada Admin',
  actor_user_id: '11111111-1111-4111-8111-111111111111',
  target_type: 'user',
  target_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  metadata: {},
  created_at: '2026-11-07T18:00:00Z',
}

const workerUpdatedEvent = {
  id: 2,
  action: 'admin.user.updated',
  actor_name: 'Marta Moderadora',
  actor_user_id: '22222222-2222-4222-8222-222222222222',
  target_type: 'user',
  target_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  metadata: {
    kind: 'worker',
    previous_status: 'active',
    status: 'suspended',
    area_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    position_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    result: 'applied',
  },
  created_at: '2026-11-07T18:05:00Z',
}

const downloadEvent = {
  id: 3,
  action: 'download_job.created',
  actor_name: 'Ada Admin',
  target_type: 'download_job',
  target_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  metadata: {
    owner_user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    scope_type: 'selected_items',
    roots: 0,
    file_roots: 2,
    selected_total: 2,
    idempotency_key: 'idempotencia-no-visible',
  },
  created_at: '2026-11-07T18:10:00Z',
}

const driveEvent = {
  id: 4,
  action: 'drive.connected',
  actor_name: 'María Fernanda',
  target_type: 'drive_connection',
  target_id: '99999999-9999-4999-8999-999999999999',
  metadata: { email: 'maria@example.test', provider: 'google' },
  created_at: '2026-11-07T18:15:00Z',
}

const fileEvent = {
  id: 6,
  action: 'file.access_failed',
  actor_name: 'Ada Admin',
  target_type: 'stored_file',
  target_id: '77777777-7777-4777-8777-777777777777',
  metadata: {
    owner_user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    job_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    reason: 'not_available',
  },
  created_at: '2026-11-07T18:25:00Z',
}

const unknownEvent = {
  id: 5,
  action: 'future.event',
  actor_name: 'Sistema',
  target_type: 'future_resource',
  target_id: '66666666-6666-4666-8666-666666666666',
  metadata: {
    custom_label: 'Valor visible',
    flag: true,
    list: [1, 2],
    empty: null,
    ...Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`extra_${index + 1}`, `Valor adicional ${index + 1}`])),
    nested: {
      allowed: 'Anidado visible',
      password: 'secreto-no-visible',
    },
    refresh_token: 'token-no-visible',
    relative_path: 'ruta/fisica/no-visible',
  },
  created_at: '2026-11-07T18:20:00Z',
}

const allEvents = [operatorEvent, workerUpdatedEvent, downloadEvent, driveEvent, fileEvent, unknownEvent]
const operationalEvents = [workerUpdatedEvent, downloadEvent, driveEvent]

async function mockAudit(page, role, events) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: users[role],
          permissions: permissions[role],
          has_local_credentials: true,
          must_rotate_password: false,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/admin/audit-events')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: events, pagination: { page: 1, page_size: 25, total: events.length } }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], pagination: { total: 0 } }),
    })
  })
}

async function openDetail(page, title) {
  await page.getByRole('button', { name: `Ver detalle de ${title}` }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test('el administrador consulta el detalle contextual de la auditoría', async ({ page }) => {
  let auditRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/admin/audit-events')) auditRequests += 1
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockAudit(page, 'admin', allEvents)
  await page.goto('/app/admin/audit')
  await expect(page.getByRole('heading', { name: 'Auditoría', level: 1 })).toBeVisible()
  await expect(page.getByText('Inicio de sesión administrativo')).toBeVisible()

  let dialog = await openDetail(page, 'Inicio de sesión administrativo')
  await expect(dialog.getByRole('heading', { name: 'Inicio de sesión administrativo', level: 2 })).toBeVisible()
  await expect(dialog.getByText('Autenticación').first()).toBeVisible()
  await expect(dialog.getByText('Correcto').first()).toBeVisible()
  await expect(dialog.getByText('Ada Admin')).toBeVisible()

  const centeredBox = await dialog.boundingBox()
  expect(centeredBox.width).toBeLessThanOrEqual(800)
  expect(centeredBox.height).toBeLessThanOrEqual(Math.floor(900 * 0.86))
  expect(Math.abs(centeredBox.x + centeredBox.width / 2 - 720)).toBeLessThanOrEqual(2)
  expect(Math.abs(centeredBox.y + centeredBox.height / 2 - 450)).toBeLessThanOrEqual(2)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

  const technical = dialog.locator('details')
  expect(await technical.evaluate((element) => element.open)).toBeFalsy()
  await dialog.getByText('Información técnica').click()
  await expect(technical.getByText('auth.admin.login')).toBeVisible()

  const requestsBeforeClose = auditRequests
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(auditRequests).toBe(requestsBeforeClose)
  await expect(page.getByRole('button', { name: 'Ver detalle de Inicio de sesión administrativo' })).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

  await page.getByLabel('Filtrar por acción').fill('download_job.created')
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByLabel('Filtrar por acción')).toHaveValue('download_job.created')

  dialog = await openDetail(page, 'Trabajo de descarga creado')
  await expect(dialog.getByText('Modalidad del snapshot')).toBeVisible()
  await expect(dialog.getByText('Archivos y carpetas seleccionados')).toBeVisible()
  await expect(dialog.getByText('Carpetas raíz')).toBeVisible()
  await expect(dialog.getByText('Archivos individuales')).toBeVisible()
  await expect(dialog.getByText('Elementos seleccionados')).toBeVisible()
  await expect(dialog.getByText('idempotencia-no-visible')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cerrar detalle de auditoría' }).click()
  await expect(page.getByLabel('Filtrar por acción')).toHaveValue('download_job.created')

  dialog = await openDetail(page, 'Trabajador actualizado')
  await expect(dialog.getByText('Estado anterior')).toBeVisible()
  await expect(dialog.getByText('Estado actual')).toBeVisible()
  await expect(dialog.getByText('Activo')).toBeVisible()
  await expect(dialog.getByText('Suspendido')).toBeVisible()
  await page.keyboard.press('Escape')

  dialog = await openDetail(page, 'Google Drive conectado')
  await expect(dialog.getByText('Cuenta autorizada')).toBeVisible()
  await expect(dialog.getByText('maria@example.test')).toBeVisible()
  await expect(dialog.getByText('Google', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  dialog = await openDetail(page, 'Evento no catalogado')
  await expect(dialog.getByText('Sistema').first()).toBeVisible()
  await expect(dialog.getByText('Custom label')).toBeVisible()
  await expect(dialog.getByText('Valor visible')).toBeVisible()
  await expect(dialog.getByText('Anidado visible')).toBeVisible()
  await expect(dialog.getByText('Sí')).toBeVisible()
  await expect(dialog.getByText('No disponible')).toBeVisible()
  await expect(dialog.getByText('secreto-no-visible')).toHaveCount(0)
  await expect(dialog.getByText('token-no-visible')).toHaveCount(0)
  await expect(dialog.getByText('ruta/fisica/no-visible')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)

  const body = page.getByTestId('audit-detail-body')
  const header = page.getByTestId('audit-detail-header')
  const footer = page.getByTestId('audit-detail-footer')
  const headerTop = (await header.boundingBox()).y
  const footerBottom = (await footer.boundingBox()).y + (await footer.boundingBox()).height
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy()
  await body.hover()
  await page.mouse.wheel(0, 600)
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect((await header.boundingBox()).y).toBe(headerTop)
  expect((await footer.boundingBox()).y + (await footer.boundingBox()).height).toBe(footerBottom)
  await expect(page.getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible()
})

test('el moderador ve solo sus eventos con el mismo detalle', async ({ page }) => {
  await mockAudit(page, 'moderator', operationalEvents)
  await page.goto('/app/admin/audit')
  await expect(page.getByText(/Auditoría operacional/)).toBeVisible()
  await expect(page.getByText('Inicio de sesión administrativo')).toHaveCount(0)

  const dialog = await openDetail(page, 'Trabajador actualizado')
  await expect(dialog.getByRole('heading', { name: 'Trabajador actualizado', level: 2 })).toBeVisible()
  await expect(dialog.getByText('Autenticación')).toHaveCount(0)
  await expect(dialog.getByText('Trabajadores y organización').first()).toBeVisible()
})

test('solo lectura consulta el detalle sin acciones de escritura', async ({ page }) => {
  await mockAudit(page, 'read_only', allEvents)
  await page.goto('/app/admin/audit')
  await expect(page.getByText(/Auditoría institucional completa/)).toBeVisible()

  const dialog = await openDetail(page, 'Inicio de sesión administrativo')
  await expect(dialog.getByText('Ada Admin')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Editar|Eliminar|Desactivar|Publicar/i })).toHaveCount(0)
})



test('presenta responsabilidades iniciales y cambios organizativos', async ({ page }) => {
  const scenarios = [
    {
      event: {
        id: 20, action: 'area.created', actor_name: 'Ada Admin', target_type: 'area', target_id: 'area-20',
        metadata: { name: 'Área Nueva', responsibilities: { after: ['Primera responsabilidad', 'Segunda responsabilidad'] } },
        created_at: '2026-11-10T10:00:00Z',
      },
      title: 'Área creada',
      checks: ['Responsabilidades iniciales', 'Primera responsabilidad', 'Segunda responsabilidad'],
    },
    {
      event: {
        id: 21, action: 'area.updated', actor_name: 'Ada Admin', target_type: 'area', target_id: 'area-21',
        metadata: { name: 'Área Reordenada', responsibilities: { changed: true, before: ['A', 'B'], after: ['B', 'A', 'C'] } },
        created_at: '2026-11-10T10:05:00Z',
      },
      title: 'Área actualizada',
      checks: ['Cambios en responsabilidades', 'Antes', 'Después', '1 agregada(s)', '2 conservada(s)', 'Orden modificado', 'Agregada'],
    },
    {
      event: {
        id: 22, action: 'area.updated', actor_name: 'Ada Admin', target_type: 'area', target_id: 'area-22',
        metadata: { name: 'Área Editada', responsibilities: { changed: true, before: ['Texto anterior'], after: ['Texto nuevo'] } },
        created_at: '2026-11-10T10:10:00Z',
      },
      title: 'Área actualizada',
      checks: ['Texto anterior', 'Texto nuevo', '1 agregada(s)', '1 eliminada(s)', 'Agregada', 'Eliminada'],
    },
    {
      event: {
        id: 23, action: 'position.updated', actor_name: 'Ada Admin', target_type: 'position', target_id: 'position-23',
        metadata: { name: 'Cargo sin responsabilidades', status: 'active', responsibilities: { changed: true, before: ['A', 'B'], after: [] } },
        created_at: '2026-11-10T10:15:00Z',
      },
      title: 'Cargo actualizado',
      checks: ['2 eliminada(s)', 'Sin responsabilidades registradas.'],
    },
    {
      event: {
        id: 24, action: 'area.updated', actor_name: 'Ada Admin', target_type: 'area', target_id: 'area-24',
        metadata: { name: 'Área solo nombre', status: 'inactive' },
        created_at: '2026-11-10T10:20:00Z',
      },
      title: 'Área actualizada',
      checks: ['No se registraron cambios de responsabilidades en este evento.'],
      absent: ['Cambios en responsabilidades'],
    },
    {
      event: {
        id: 25, action: 'area.created', actor_name: 'Ada Admin', target_type: 'area', target_id: 'area-25',
        metadata: { name: 'Área histórica' },
        created_at: '2026-11-10T10:25:00Z',
      },
      title: 'Área creada',
      checks: ['La información de responsabilidades no está disponible en este evento histórico.'],
    },
  ]

  for (const scenario of scenarios) {
    await page.unroute('**/api/v1/**')
    await mockAudit(page, 'admin', [scenario.event])
    await page.goto('/app/admin/audit')
    await expect(page.getByRole('heading', { name: 'Auditoría', level: 1 })).toBeVisible()
    const dialog = await openDetail(page, scenario.title)
    for (const text of scenario.checks) {
      await expect(dialog.getByText(text, { exact: true }).first()).toBeVisible()
    }
    for (const text of scenario.absent || []) {
      await expect(dialog.getByText(text, { exact: true })).toHaveCount(0)
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
})

test('el trabajador permanece excluido de Auditoría', async ({ page }) => {
  await mockAudit(page, 'user', [])
  await page.goto('/app')
  await expect(page.getByTestId('worker-sidebar')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Auditoría' })).toHaveCount(0)
  await expect(page.getByText('Ver auditoría')).toHaveCount(0)

  await page.goto('/app/admin/audit')
  await expect(page.getByText('Acceso no autorizado')).toBeVisible()
})

test('el detalle se adapta a móvil y True Black', async ({ page }) => {
  await mockAudit(page, 'admin', allEvents)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/admin/audit')
  const dialog = await openDetail(page, 'Acceso al archivo rechazado')
  const box = await dialog.boundingBox()
  expect(box.width).toBeLessThanOrEqual(390)
  expect(box.width).toBeGreaterThan(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(dialog.getByText('Rechazado', { exact: true }).first()).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.setViewportSize({ width: 768, height: 1024 })
  const tabletDialog = await openDetail(page, 'Google Drive conectado')
  const tabletBox = await tabletDialog.boundingBox()
  expect(tabletBox.width).toBeLessThanOrEqual(768 * 0.9)
  expect(Math.abs(tabletBox.x + tabletBox.width / 2 - 384)).toBeLessThanOrEqual(2)
  await tabletDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => localStorage.setItem('terra-theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  const darkDialog = await openDetail(page, 'Google Drive conectado')
  await expect(darkDialog.getByText('maria@example.test')).toBeVisible()
  await expect(page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgb(255, 255, 255)')
})
