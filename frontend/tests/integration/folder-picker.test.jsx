import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FolderPicker from '../../src/features/drive/FolderPicker'
import { api } from '../../src/services/api'

vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn() },
  queryString: (params = {}) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
    })
    const raw = search.toString()
    return raw ? `?${raw}` : ''
  },
}))

const folder = {
  id: 'folder-1',
  name: 'Documentos',
  mime_type: 'application/vnd.google-apps.folder',
  kind: 'folder',
  size_bytes: null,
  created_time: '2026-11-01T10:00:00Z',
  modified_time: '2026-11-04T10:30:00Z',
  can_download: false,
  is_shortcut: false,
  starred: false,
  shared: false,
}

const pdf = {
  id: 'pdf-1',
  name: 'Reporte.pdf',
  mime_type: 'application/pdf',
  kind: 'file',
  size_bytes: 2457600,
  created_time: '2026-11-01T10:00:00Z',
  modified_time: '2026-11-04T10:30:00Z',
  can_download: true,
  is_shortcut: false,
  starred: false,
  shared: true,
}

const sheet = {
  id: 'sheet-1',
  name: 'Resumen',
  mime_type: 'application/vnd.google-apps.spreadsheet',
  kind: 'file',
  size_bytes: null,
  modified_time: '2026-11-04T10:30:00Z',
  can_download: true,
  is_shortcut: false,
  starred: false,
  shared: false,
}

const locked = {
  id: 'locked-1',
  name: 'Privado.bin',
  mime_type: 'application/octet-stream',
  kind: 'file',
  size_bytes: 1024,
  can_download: false,
  is_shortcut: false,
  starred: false,
  shared: false,
}

const shortcut = {
  id: 'shortcut-1',
  name: 'Acceso',
  mime_type: 'application/vnd.google-apps.shortcut',
  kind: 'shortcut',
  is_shortcut: true,
  shortcut_target_mime_type: 'application/vnd.google-apps.folder',
  can_download: false,
  starred: false,
  shared: false,
}

function response(parent, items, next = '') {
  return {
    parent,
    path: [{ id: 'root-id', name: 'Mi unidad' }],
    is_root: parent.id === 'root-id',
    items,
    next_page_token: next,
  }
}

function mockPages(pages) {
  api.get.mockImplementation((url) => {
    const parsed = new URL(url, 'http://localhost')
    const parentId = parsed.searchParams.get('parentId')
    const token = parsed.searchParams.get('page_token') || ''
    const key = `${parentId}:${token}`
    const page = pages[key]
    if (!page) return Promise.resolve(response({ id: parentId, name: 'Carpeta' }, []))
    return Promise.resolve(page)
  })
}

describe('FolderPicker', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('muestra carpetas y archivos con metadatos reales', async () => {
    mockPages({
      'root:': response({ id: 'root-id', name: 'Mi unidad' }, [folder, pdf, sheet, shortcut, locked]),
    })
    render(<FolderPicker userId="worker-1" selected={[]} onChange={vi.fn()} />)

    expect(await screen.findByText('Documentos')).toBeInTheDocument()
    expect(screen.getByText('Reporte.pdf')).toBeInTheDocument()
    expect(screen.getByText('Resumen')).toBeInTheDocument()
    expect(screen.getByText('Acceso')).toBeInTheDocument()
    expect(screen.getAllByText('2.3 MB').length).toBeGreaterThan(0)
    // El MIME se muestra en la columna Tipo y, en contenedores estrechos, bajo el nombre.
    expect(screen.getAllByText('application/pdf').length).toBeGreaterThan(0)
    expect(screen.getByText(/No descargable/)).toBeInTheDocument()
    expect(screen.getByText('Privado.bin')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Seleccionar carpeta Documentos' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Reporte/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Acceso/ })).not.toBeInTheDocument()
  })

  it('navega a una subcarpeta y conserva la selección', async () => {
    mockPages({
      'root:': response({ id: 'root-id', name: 'Mi unidad' }, [folder, pdf]),
      'folder-1:': {
        ...response({ id: 'folder-1', name: 'Documentos' }, [sheet]),
        path: [{ id: 'root-id', name: 'Mi unidad' }, { id: 'folder-1', name: 'Documentos' }],
      },
    })
    const onChange = vi.fn()
    const { rerender } = render(<FolderPicker userId="worker-1" selected={[]} onChange={onChange} />)
    await screen.findByText('Documentos')

    fireEvent.click(screen.getByText('Documentos'))
    expect(await screen.findByText('Resumen')).toBeInTheDocument()
    expect(screen.getByText('Mi unidad')).toBeInTheDocument()
    expect(screen.getByText('Documentos', { selector: 'button' })).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Volver a Mi unidad'))
    expect(await screen.findByText('Reporte.pdf')).toBeInTheDocument()
    rerender(<FolderPicker userId="worker-1" selected={[{ id: 'folder-1', name: 'Documentos', path: 'Documentos' }]} onChange={onChange} />)
    expect(screen.getByText('Carpetas seleccionadas (1)')).toBeInTheDocument()
  })

  it('solo permite seleccionar carpetas', async () => {
    mockPages({ 'root:': response({ id: 'root-id', name: 'Mi unidad' }, [folder, pdf]) })
    const onChange = vi.fn()
    render(<FolderPicker userId="worker-1" selected={[]} onChange={onChange} />)
    await screen.findByText('Documentos')

    fireEvent.click(screen.getByLabelText('Seleccionar carpeta Documentos'))
    expect(onChange).toHaveBeenCalledWith([{ id: 'folder-1', name: 'Documentos', path: 'Documentos' }])
    expect(screen.queryByText('Reporte.pdf', { selector: 'button' })).not.toBeInTheDocument()
  })

  it('carga la siguiente página sin perder los elementos actuales', async () => {
    api.get.mockImplementation((url) => {
      const parsed = new URL(url, 'http://localhost')
      const parentId = parsed.searchParams.get('parentId')
      const token = parsed.searchParams.get('page_token') || ''
      if (parentId === 'root') return Promise.resolve(response({ id: 'root-id', name: 'Mi unidad' }, [folder]))
      if (token === 'next-1') return Promise.resolve(response({ id: 'folder-1', name: 'Documentos' }, [sheet], ''))
      return Promise.resolve(response({ id: 'folder-1', name: 'Documentos' }, [pdf], 'next-1'))
    })
    render(<FolderPicker userId="worker-1" selected={[]} onChange={vi.fn()} />)
    fireEvent.click(await screen.findByText('Documentos'))
    expect(await screen.findByText('Reporte.pdf')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más elementos' }))
    expect(await screen.findByText('Resumen')).toBeInTheDocument()
    expect(screen.getByText('Reporte.pdf')).toBeInTheDocument()
  })

  it('muestra el error de Google Drive sin datos ficticios', async () => {
    api.get.mockRejectedValue(new Error('El trabajador debe reconectar su cuenta de Google Drive.'))
    render(<FolderPicker userId="worker-1" selected={[]} onChange={vi.fn()} />)
    expect(await screen.findByText('El trabajador debe reconectar su cuenta de Google Drive.')).toBeInTheDocument()
    expect(screen.queryByText('Documentos')).not.toBeInTheDocument()
  })
})
