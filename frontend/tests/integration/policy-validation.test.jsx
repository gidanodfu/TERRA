import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PolicyPage from '../../src/pages/admin/PolicyPage'
import { api } from '../../src/services/api'

vi.mock('../../src/services/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

describe('PolicyPage', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
    api.get.mockResolvedValue({
      version: '2026-01',
      content: 'Política vigente',
      published_at: '2026-01-01T00:00:00Z',
    })
  })

  it('muestra los errores de validación del servidor y conserva el contenido', async () => {
    api.post.mockRejectedValue({
      message: 'Revise la política institucional.',
      fields: { version: 'Indique una versión.', content: 'El contenido es obligatorio.' },
    })
    render(<PolicyPage />)
    await screen.findByText('Política vigente')

    fireEvent.change(screen.getByLabelText('Identificador de versión'), { target: { value: '2026-02' } })
    fireEvent.change(screen.getByLabelText('Contenido aprobado'), { target: { value: 'Texto aprobado' } })
    fireEvent.click(screen.getByRole('button', { name: /Publicar versión/i }))

    expect(await screen.findByText('Indique una versión.')).toBeInTheDocument()
    expect(screen.getByText('El contenido es obligatorio.')).toBeInTheDocument()
    expect(screen.getByLabelText('Identificador de versión')).toHaveValue('2026-02')
    expect(screen.getByLabelText('Contenido aprobado')).toHaveValue('Texto aprobado')
  })

  it('publica una versión válida y limpia el formulario', async () => {
    api.post.mockResolvedValue({ version: '2026-02' })
    render(<PolicyPage />)
    await screen.findByText('Política vigente')

    fireEvent.change(screen.getByLabelText('Identificador de versión'), { target: { value: '2026-02' } })
    fireEvent.change(screen.getByLabelText('Contenido aprobado'), { target: { value: 'Texto aprobado' } })
    fireEvent.click(screen.getByRole('button', { name: /Publicar versión/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/policies', {
      version: '2026-02',
      content: 'Texto aprobado',
    }))
    expect(await screen.findByText(/Versión publicada/)).toBeInTheDocument()
  })
})
