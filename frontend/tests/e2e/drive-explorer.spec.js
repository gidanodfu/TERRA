import { expect, test } from '@playwright/test'
import { ADMIN_PERMISSIONS } from '../fixtures/permissions'

const worker = {
  id: '22222222-2222-4222-8222-222222222222',
  first_name: 'Tra',
  last_name: 'Bajador',
  display_name: 'Tra Bajador',
  email: 'worker@example.test',
  area_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  area_name: 'Sistemas',
  position_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position_name: 'Analista',
  status: 'active',
  roles: ['user'],
}

const admin = {
  id: '11111111-1111-4111-8111-111111111111',
  first_name: 'Ada',
  last_name: 'Admin',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  status: 'active',
  roles: ['admin'],
}

const connection = {
  id: 'connection-1',
  user_id: worker.id,
  status: 'connected',
  has_refresh_token: true,
  policy_consent_version: '2026-11',
  connected_at: '2026-11-01T10:00:00Z',
}

const policy = { version: '2026-11', published_at: '2026-11-01T10:00:00Z' }

const folder = (id, name) => ({
  id, name, mime_type: 'application/vnd.google-apps.folder', kind: 'folder',
  size_bytes: null, created_time: '2026-11-01T10:00:00Z', modified_time: '2026-11-04T10:30:00Z',
  can_download: false, selectable: true, is_shortcut: false, starred: false, shared: false,
})

const pdf = {
  id: 'file-pdf', name: 'Informe.pdf', mime_type: 'application/pdf', kind: 'file',
  size_bytes: 2457600, created_time: '2026-11-01T10:00:00Z', modified_time: '2026-11-04T10:30:00Z',
  can_download: true, selectable: true, is_shortcut: false, starred: false, shared: false,
}

const xlsx = {
  id: 'file-xlsx', name: 'Resumen.xlsx',
  mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file',
  size_bytes: 51200, created_time: '2026-11-01T10:00:00Z', modified_time: '2026-11-04T10:30:00Z',
  can_download: true, selectable: true, is_shortcut: false, starred: false, shared: false,
}

const png = {
  id: 'file-png', name: 'Imagen.png', mime_type: 'image/png', kind: 'file',
  size_bytes: 102400, created_time: '2026-11-01T10:00:00Z', modified_time: '2026-11-04T10:30:00Z',
  can_download: true, selectable: true, is_shortcut: false, starred: false, shared: false,
}

const roots = {
  root: {
    parent: { id: 'root-id', name: 'Mi unidad' },
    path: [{ id: 'root-id', name: 'Mi unidad' }],
    is_root: true,
    items: [folder('folder-docs', 'Documentos'), png],
    next_page_token: '',
  },
  'folder-docs': {
    parent: { id: 'folder-docs', name: 'Documentos' },
    path: [{ id: 'root-id', name: 'Mi unidad' }, { id: 'folder-docs', name: 'Documentos' }],
    is_root: false,
    items: [folder('folder-reports', 'Informes'), folder('folder-contracts', 'Contratos'), png],
    next_page_token: '',
  },
  'folder-reports': {
    parent: { id: 'folder-reports', name: 'Informes' },
    path: [
      { id: 'root-id', name: 'Mi unidad' },
      { id: 'folder-docs', name: 'Documentos' },
      { id: 'folder-reports', name: 'Informes' },
    ],
    is_root: false,
    items: [pdf, xlsx],
    next_page_token: '',
  },
}

async function openWizard(page) {
  const state = { snapshotBody: null, itemRequests: [] }
  await page.route('**/api/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/auth/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: admin,
          permissions: ADMIN_PERMISSIONS,
          has_local_credentials: true,
          must_rotate_password: false,
          pending_profile: false,
        }),
      })
    }
    if (path.endsWith('/admin/users')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [worker], pagination: { page: 1, page_size: 100, total: 1 } }),
      })
    }
    if (path.endsWith(`/admin/users/${worker.id}/drive/connection`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connection, policy }),
      })
    }
    if (path.endsWith(`/admin/users/${worker.id}/drive/items`)) {
      const parent = new URL(request.url()).searchParams.get('parentId') || 'root'
      state.itemRequests.push(parent)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(roots[parent] || roots.root),
      })
    }
    if (path.endsWith(`/admin/users/${worker.id}/download-jobs`) && request.method() === 'POST') {
      state.snapshotBody = request.postDataJSON()
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'job-1', status: 'queued' }),
      })
    }
    if (path.endsWith('/admin/download-jobs/job-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'job-1', status: 'queued', area_name: 'Sistemas', position_name: 'Analista',
          drive_owner_name: worker.display_name, requested_by_name: admin.display_name,
          scope_type: 'selected_items', roots: [{ google_folder_id: 'folder-docs', source_path: 'Documentos' }],
          file_roots: [{ google_file_id: 'file-png', source_path: 'Imagen.png' }],
          total_items: 0, completed_items: 0, skipped_items: 0, failed_items: 0,
          downloaded_bytes: 0, total_bytes: 0, created_at: '2026-11-05T12:00:00Z',
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], pagination: { total: 0 } }) })
  })
  await page.goto(`/app/admin/downloads?worker=${worker.id}`)
  await page.getByRole('radio', { name: /Archivos y carpetas seleccionados/ }).check()
  return state
}

test('selecciona carpetas y archivos individuales en el mismo snapshot', async ({ page }) => {
  const state = await openWizard(page)
  await expect(page.getByText('Documentos')).toBeVisible()
  await expect(page.getByText('Imagen.png')).toBeVisible()

  await page.getByRole('checkbox', { name: 'Seleccionar carpeta Documentos' }).check()
  await page.getByRole('checkbox', { name: 'Seleccionar archivo Imagen.png' }).check()
  await expect(page.getByText('Carpetas seleccionadas (1)')).toBeVisible()
  await expect(page.getByText('Archivos seleccionados (1)')).toBeVisible()

  await page.getByRole('button', { name: 'Iniciar descarga' }).click()
  await expect(page).toHaveURL(/\/app\/admin\/jobs\/job-1$/)
  expect(state.snapshotBody).toEqual({
    scope_type: 'selected_items',
    root_folder_ids: ['folder-docs'],
    root_file_ids: ['file-png'],
  })
})

test('descarga un archivo individual dentro de una subcarpeta', async ({ page }) => {
  const state = await openWizard(page)
  await page.getByRole('button', { name: 'Documentos' }).click()
  await page.getByRole('button', { name: 'Informes' }).click()
  await expect(page.getByText('Resumen.xlsx')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Seleccionar archivo Resumen.xlsx' }).check()
  await expect(page.getByText('Archivos seleccionados (1)')).toBeVisible()

  await page.getByRole('button', { name: 'Iniciar descarga' }).click()
  await expect(page).toHaveURL(/\/app\/admin\/jobs\/job-1$/)
  expect(state.snapshotBody).toEqual({
    scope_type: 'selected_items',
    root_folder_ids: [],
    root_file_ids: ['file-xlsx'],
  })
  expect(state.itemRequests).toContain('folder-docs')
  expect(state.itemRequests).toContain('folder-reports')
})

test('la carpeta padre absorbe el archivo seleccionado y evita duplicados', async ({ page }) => {
  const state = await openWizard(page)
  await page.getByRole('button', { name: 'Documentos' }).click()
  await page.getByRole('button', { name: 'Informes' }).click()
  await page.getByRole('checkbox', { name: 'Seleccionar archivo Resumen.xlsx' }).check()
  await page.getByRole('button', { name: 'Volver a Documentos' }).click()
  await expect(page.getByRole('checkbox', { name: 'Seleccionar carpeta Informes' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Seleccionar carpeta Informes' }).check()

  await expect(page.getByText('Carpetas seleccionadas (1)')).toBeVisible()
  await expect(page.getByText('Archivos seleccionados', { exact: false })).toHaveCount(0)

  await page.getByRole('button', { name: 'Iniciar descarga' }).click()
  await expect(page).toHaveURL(/\/app\/admin\/jobs\/job-1$/)
  expect(state.snapshotBody).toEqual({
    scope_type: 'selected_items',
    root_folder_ids: ['folder-reports'],
    root_file_ids: [],
  })
})
