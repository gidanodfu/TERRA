import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JobDetailPage from '../../src/pages/JobDetailPage'
import { api } from '../../src/services/api'

const auth = vi.hoisted(() => ({ can: vi.fn(() => true) }))
vi.mock('../../src/app/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  queryString: () => '',
}))
vi.mock('../../src/features/downloads/useJobEvents', () => ({
  useJobEvents: () => true,
}))

const job = {
  id: 'job-1',
  status: 'completed',
  scope_type: 'selected_items',
  total_items: 1,
  completed_items: 1,
  skipped_items: 0,
  failed_items: 0,
  total_bytes: 2048,
  downloaded_bytes: 2048,
  created_at: '2026-11-05T10:00:00Z',
  drive_owner_name: 'Tra Bajador',
  requested_by_name: 'Ada Admin',
  area_name: 'Gestión Documental',
  position_name: 'Analista',
  roots: [],
  file_roots: [],
}

const item = (overrides = {}) => ({
  id: 'item-1',
  job_id: 'job-1',
  drive_node_id: 'node-1',
  google_file_id: 'file-1',
  stored_file_id: 'stored-file-1',
  name: 'Reporte.pdf',
  mime_type: 'application/pdf',
  status: 'completed',
  attempt_count: 1,
  size_bytes: 2048,
  sha256: 'abcdef0123456789',
  ...overrides,
})

function renderPage(basePath = '/app/jobs') {
  return render(
    <MemoryRouter initialEntries={[`${basePath}/job-1`]}>
      <Routes>
        <Route path={`${basePath}/:id`} element={<JobDetailPage basePath={basePath} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function mockApi(items) {
  api.get.mockImplementation((path) => {
    if (path === '/download-jobs/job-1') return Promise.resolve(job)
    if (path.startsWith('/download-jobs/job-1/items')) {
      return Promise.resolve({ data: items, pagination: { page: 1, page_size: 25, total: items.length } })
    }
    return Promise.reject(new Error(`ruta inesperada ${path}`))
  })
}

describe('JobDetailPage y descarga de archivos almacenados', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    auth.can.mockReset()
    auth.can.mockReturnValue(true)
    global.fetch = vi.fn()
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  it('descarga un elemento completado usando stored_file_id', async () => {
    mockApi([item()])
    global.fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['documento']) })
    renderPage()

    const button = await screen.findByRole('button', { name: 'Descargar Reporte.pdf' })
    fireEvent.click(button)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/files/stored-file-1/content',
      { credentials: 'include' },
    ))
  })

  it('muestra un mensaje si el archivo no está disponible físicamente', async () => {
    mockApi([item()])
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'El documento no está disponible en el almacenamiento.' } }),
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Descargar Reporte.pdf' }))
    expect(await screen.findByText('El documento no está disponible en el almacenamiento.')).toBeInTheDocument()
  })

  it('indica No disponible cuando falta stored_file_id', async () => {
    mockApi([item({ stored_file_id: null })])
    renderPage()

    await screen.findByText('Reporte.pdf')
    expect(screen.queryByRole('button', { name: 'Descargar Reporte.pdf' })).not.toBeInTheDocument()
    expect(screen.getByText('No disponible')).toBeInTheDocument()
  })

  it('oculta la descarga administrativa sin admin.files.read', async () => {
    auth.can.mockImplementation((permission) => permission !== 'admin.files.read')
    mockApi([item()])
    renderPage('/app/admin/jobs')

    await screen.findByText('Reporte.pdf')
    expect(screen.queryByRole('button', { name: 'Descargar Reporte.pdf' })).not.toBeInTheDocument()
  })
})
