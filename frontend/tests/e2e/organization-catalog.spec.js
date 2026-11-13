import { expect, test } from '@playwright/test'
import { selectOption } from './helpers/select'
import { ADMIN_PERMISSIONS } from '../fixtures/permissions'

const admin = {
  id: '11111111-1111-4111-8111-111111111111',
  display_name: 'Ada Admin',
  email: 'ada@example.test',
  status: 'active',
  roles: ['admin'],
}

const normalize = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()

function area(id, name, status = 'active', responsibilities = []) {
  return { id, name, slug: id, status, responsibilities, position_count: 0, user_count: 0 }
}

function position(id, areaId, name, status = 'active', responsibilities = []) {
  return { id, area_id: areaId, name, slug: id, status, responsibilities }
}

async function mockOrganization(page) {
  let areas = [
    area('area-a', 'Recursos Humanos', 'active', ['Administración de personal']),
    area('area-b', 'Mesa de partes'),
  ]
  const positions = {
    'area-a': [position('pos-a', 'area-a', 'Secretaria', 'active', ['Recepción de documentos'])],
    'area-b': [],
  }
  const requests = { areaCreate: null, areaUpdate: null, positionCreate: null, positionUpdate: null }

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
    if (path.endsWith('/admin/areas') && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: areas }),
      })
    }
    if (path.endsWith('/admin/areas') && request.method() === 'POST') {
      const body = request.postDataJSON()
      requests.areaCreate = body
      if (areas.some((item) => normalize(item.name) === normalize(body.name))) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'area_exists', message: 'Ya existe un área con ese nombre. Las áreas inactivas también conservan su nombre.', fields: { name: 'Ya existe un área con ese nombre.' } } }),
        })
      }
      const created = area(`area-${areas.length + 1}`, body.name, 'active', body.responsibilities || [])
      areas = [...areas, created]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    const areaMatch = path.match(/\/admin\/areas\/([^/]+)$/)
    if (areaMatch && request.method() === 'PATCH') {
      const body = request.postDataJSON()
      requests.areaUpdate = body
      if (areas.some((item) => item.id !== areaMatch[1] && normalize(item.name) === normalize(body.name))) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'area_exists', message: 'Ya existe un área con ese nombre. Las áreas inactivas también conservan su nombre.', fields: { name: 'Ya existe un área con ese nombre.' } } }),
        })
      }
      areas = areas.map((item) => item.id === areaMatch[1] ? { ...item, ...body } : item)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(areas.find((item) => item.id === areaMatch[1])) })
    }
    const listMatch = path.match(/\/admin\/areas\/([^/]+)\/positions$/)
    if (listMatch && request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: positions[listMatch[1]] || [] }),
      })
    }
    if (listMatch && request.method() === 'POST') {
      const body = request.postDataJSON()
      requests.positionCreate = body
      const areaID = listMatch[1]
      if ((positions[areaID] || []).some((item) => normalize(item.name) === normalize(body.name))) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'position_exists', message: 'Ya existe un cargo con ese nombre dentro del área seleccionada.', fields: { name: 'Ya existe un cargo con ese nombre en el área.' } } }),
        })
      }
      const created = position(`pos-${areaID}-${(positions[areaID] || []).length + 1}`, areaID, body.name, 'active', body.responsibilities || [])
      positions[areaID] = [...(positions[areaID] || []), created]
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) })
    }
    const positionMatch = path.match(/\/admin\/positions\/([^/]+)$/)
    if (positionMatch && request.method() === 'PATCH') {
      const body = request.postDataJSON()
      requests.positionUpdate = body
      for (const key of Object.keys(positions)) {
        const index = positions[key].findIndex((item) => item.id === positionMatch[1])
        if (index >= 0) {
          positions[key][index] = { ...positions[key][index], ...body }
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(positions[key][index]) })
        }
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'Cargo no encontrado.' } }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  })

  return { positions, requests, getAreas: () => areas }
}

async function openPage(page) {
  await page.goto('/app/admin/organization')
  await expect(page.getByRole('heading', { name: 'Áreas y cargos', level: 1 })).toBeVisible()
}

test('crea un área con responsabilidades y rechaza duplicados sin cerrar el modal', async ({ page }) => {
  const state = await mockOrganization(page)
  await openPage(page)

  await page.getByRole('button', { name: 'Nueva área' }).click()
  await page.getByLabel('Nombre del área').fill('Gestión de personas')
  await page.getByRole('button', { name: 'Añadir responsabilidad' }).click()
  await page.getByRole('textbox', { name: 'Responsabilidad 1', exact: true }).fill('Coordinación interna')
  await page.getByRole('button', { name: 'Añadir responsabilidad' }).click()
  await page.getByRole('textbox', { name: 'Responsabilidad 2', exact: true }).fill('  Seguimiento   de expedientes ')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Área creada.')).toBeVisible()
  await expect(page.getByText('Gestión de personas')).toBeVisible()
  expect(state.requests.areaCreate.responsibilities).toEqual(['Coordinación interna', 'Seguimiento de expedientes'])

  await page.getByRole('button', { name: 'Nueva área' }).click()
  await page.getByLabel('Nombre del área').fill('GESTIÓN   DE PERSONAS')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByLabel('Nombre del área')).toHaveValue('GESTIÓN   DE PERSONAS')
  await expect(page.getByText('Ya existe un área con ese nombre.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nueva área' })).toBeVisible()
})

test('crea cargos por área y rechaza duplicados dentro de la misma área', async ({ page }) => {
  const state = await mockOrganization(page)
  await openPage(page)

  await page.getByRole('button', { name: 'Nuevo cargo' }).click()
  await page.getByLabel('Nombre del cargo').fill('Analista')
  await page.getByRole('button', { name: 'Añadir responsabilidad' }).click()
  await page.getByRole('textbox', { name: 'Responsabilidad 1', exact: true }).fill('Análisis documental')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Cargo creado.')).toBeVisible()
  expect(state.requests.positionCreate.responsibilities).toEqual(['Análisis documental'])

  await page.getByRole('button', { name: 'Nuevo cargo' }).click()
  await page.getByLabel('Nombre del cargo').fill(' analista ')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/Ya existe un cargo con ese nombre/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nuevo cargo' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar' }).click()

  await page.getByRole('button', { name: /Mesa de partes Activa/ }).click()
  await page.getByRole('button', { name: 'Nuevo cargo' }).click()
  await page.getByLabel('Nombre del cargo').fill('Analista')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Cargo creado.')).toBeVisible()
  await expect(page.getByText('Analista')).toBeVisible()
})

test('edita responsabilidades y estado de áreas y cargos', async ({ page }) => {
  const state = await mockOrganization(page)
  await openPage(page)

  await page.getByRole('button', { name: 'Editar Recursos Humanos' }).click()
  await page.getByLabel('Nombre del área').fill('Recursos Humanos Actualizada')
  await page.getByLabel('Quitar responsabilidad 1').click()
  await page.getByRole('button', { name: 'Añadir responsabilidad' }).click()
  await page.getByRole('textbox', { name: 'Responsabilidad 1', exact: true }).fill('Nueva responsabilidad')
  await selectOption(page, 'Estado', 'Inactiva')
  await page.getByRole('button', { name: 'Guardar' }).click()

  expect(state.requests.areaUpdate).toMatchObject({
    name: 'Recursos Humanos Actualizada',
    status: 'inactive',
    responsibilities: ['Nueva responsabilidad'],
  })
  await expect(page.getByRole('button', { name: /Recursos Humanos Actualizada Inactiva/ })).toBeVisible()

  await page.getByRole('button', { name: 'Editar Secretaria' }).click()
  await page.getByLabel('Nombre del cargo').fill('Secretaria Ejecutiva')
  await page.getByRole('button', { name: 'Añadir responsabilidad' }).click()
  await page.getByRole('textbox', { name: 'Responsabilidad 2', exact: true }).fill('Agenda institucional')
  await page.getByRole('button', { name: 'Guardar' }).click()
  expect(state.requests.positionUpdate).toMatchObject({
    name: 'Secretaria Ejecutiva',
    responsibilities: ['Recepción de documentos', 'Agenda institucional'],
  })
  await expect(page.getByText('Secretaria Ejecutiva')).toBeVisible()
})
