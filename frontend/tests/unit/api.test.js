import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, queryString } from '../../src/services/api'

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

describe('cliente HTTP', () => {
  beforeEach(() => {
    document.cookie = 'terra_csrf=csrf-test; path=/'
  })

  it('realiza GET con credenciales y sin CSRF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }))
    global.fetch = fetchMock
    const result = await api.get('/public/areas')
    expect(result).toEqual({ data: [] })
    const [, options] = fetchMock.mock.calls[0]
    expect(options.credentials).toBe('include')
    expect(options.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('envía CSRF y JSON en POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(202, { id: 'job-1' }))
    global.fetch = fetchMock
    await api.post('/download-jobs', { scope_type: 'my_drive_full' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/download-jobs')
    expect(options.method).toBe('POST')
    expect(options.headers['X-CSRF-Token']).toBe('csrf-test')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ scope_type: 'my_drive_full' })
  })

  it('convierte errores HTTP en ApiError con campos', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(422, {
      error: { code: 'validation_error', message: 'Datos inválidos', fields: { area_id: 'Requerida' } },
      request_id: 'req-1',
    }))
    await expect(api.patch('/me/profile', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'validation_error',
      fields: { area_id: 'Requerida' },
    })
    expect(new ApiError('x').message).toBe('x')
  })

  it('propaga respuestas no JSON como error seguro', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => 'bad gateway' })
    await expect(api.get('/ready')).rejects.toMatchObject({ status: 502, code: 'error' })
  })

  it('construye query strings sin valores vacíos', () => {
    expect(queryString({ page: 2, status: '', q: undefined })).toBe('?page=2')
    expect(queryString({})).toBe('')
  })
})
