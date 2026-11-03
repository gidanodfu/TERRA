import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import JobTable from '../../src/features/downloads/JobTable'
import { jobs } from '../fixtures/jobs'

describe('JobTable', () => {
  it('muestra propietario, alcance, estado y progreso', () => {
    render(
      <MemoryRouter>
        <JobTable jobs={jobs} basePath="/app/jobs" showOwner />
      </MemoryRouter>,
    )
    expect(screen.getByText('Trabajador Local')).toBeInTheDocument()
    expect(screen.getByText('Mi unidad completa')).toBeInTheDocument()
    expect(screen.getByText('Descargando')).toBeInTheDocument()
    expect(screen.getByText('3/10 completados')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir trabajo/i })).toHaveAttribute(
      'href',
      '/app/jobs/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    )
  })
})
