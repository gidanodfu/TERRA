import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, ScopeLabel } from '../../src/features/downloads/StatusBadge'

describe('StatusBadge', () => {
  it('muestra la etiqueta de trabajo', () => {
    render(<StatusBadge type="job" status="downloading" />)
    expect(screen.getByText('Descargando')).toBeInTheDocument()
  })

  it('muestra estado desconocido de forma segura', () => {
    render(<StatusBadge type="job" status="invented" />)
    expect(screen.getByText('invented')).toBeInTheDocument()
  })

  it('traduce el alcance', () => {
    render(<ScopeLabel scope="selected_folders" />)
    expect(screen.getByText('Carpetas seleccionadas')).toBeInTheDocument()
  })
})
