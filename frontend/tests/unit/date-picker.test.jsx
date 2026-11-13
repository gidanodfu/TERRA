import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import DatePicker from '../../src/components/DatePicker'

function Harness({ initial = '', onChange, ...props }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <DatePicker
        id="date"
        aria-label="Fecha"
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
        {...props}
      />
      <output>{value}</output>
    </>
  )
}

async function waitForDismissListener() {
  // Radix registra el listener de clic exterior en un setTimeout(0) tras abrir.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function openCalendar() {
  fireEvent.click(screen.getByRole('button', { name: 'Fecha' }))
  return screen.getByRole('grid')
}

function dayCell(grid, day) {
  return within(grid).getAllByRole('gridcell').find((cell) => cell.textContent.trim() === String(day))
}

describe('DatePicker global', () => {
  it('muestra placeholder y selecciona una fecha en formato YYYY-MM-DD', async () => {
    const onChange = vi.fn()
    render(<Harness initial="" onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: 'Fecha' })
    expect(trigger).toHaveTextContent('Seleccionar fecha')

    const grid = openCalendar()
    fireEvent.click(within(dayCell(grid, 15)).getByRole('button'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('2026-11-15'))
    expect(screen.getByRole('button', { name: 'Fecha' })).toHaveTextContent('15/11/2026')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('permite limpiar la fecha y devuelve cadena vacía', async () => {
    const onChange = vi.fn()
    render(<Harness initial="2026-11-15" onChange={onChange} />)
    openCalendar()
    fireEvent.click(screen.getByRole('button', { name: /Limpiar fecha/i }))
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(''))
    expect(screen.getByRole('button', { name: 'Fecha' })).toHaveTextContent('Seleccionar fecha')
  })

  it('respeta límites min y max inclusivos', () => {
    render(<Harness initial="2026-11-15" min="2026-11-10" max="2026-11-20" />)
    const grid = openCalendar()
    expect(within(dayCell(grid, 9)).getByRole('button')).toBeDisabled()
    expect(within(dayCell(grid, 10)).getByRole('button')).not.toBeDisabled()
    expect(within(dayCell(grid, 20)).getByRole('button')).not.toBeDisabled()
    expect(within(dayCell(grid, 21)).getByRole('button')).toBeDisabled()
  })

  it('cierra con Escape, clic exterior y restaura el foco', async () => {
    render(<Harness initial="2026-11-15" />)
    const trigger = screen.getByRole('button', { name: 'Fecha' })
    openCalendar()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()

    openCalendar()
    await waitForDismissListener()
    fireEvent.pointerDown(document.body, { button: 0 })
    fireEvent.click(document.body)
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument())
  })

  it('navega al mes anterior y siguiente', () => {
    render(<Harness initial="2026-11-15" />)
    const grid = openCalendar()
    fireEvent.click(screen.getByRole('button', { name: /mes anterior/i }))
    expect(within(grid).getAllByRole('gridcell').some((cell) => cell.textContent.trim() === '31')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /mes siguiente/i }))
    expect(within(grid).getAllByRole('gridcell').some((cell) => cell.textContent.trim() === '1')).toBe(true)
  })

  it('deshabilita el control y expone el error accesible', () => {
    render(<Harness disabled error="Fecha inválida" />)
    const trigger = screen.getByRole('button', { name: 'Fecha' })
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Fecha inválida')).toBeInTheDocument()
  })
})
