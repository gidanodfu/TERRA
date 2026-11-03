export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', fields = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

function csrfToken() {
  const match = document.cookie.match(/(?:^|; )terra_csrf=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const token = csrfToken()
  const isUnsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(isUnsafe && token ? { 'X-CSRF-Token': token } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }
  if (!response.ok) {
    throw new ApiError(payload?.error?.message || `La operación falló (${response.status}).`, {
      status: response.status,
      code: payload?.error?.code || 'error',
      fields: payload?.error?.fields || null,
    })
  }
  return payload
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
}

export function queryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const raw = search.toString()
  return raw ? `?${raw}` : ''
}
