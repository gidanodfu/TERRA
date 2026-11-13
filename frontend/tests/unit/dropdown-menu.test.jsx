import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../src/components/dropdown-menu'

function Menu({ onEdit = vi.fn(), onDelete = vi.fn() }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Documento</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onEdit}>Abrir</DropdownMenuItem>
        <DropdownMenuItem disabled>Compartir</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onDelete}>Eliminar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Acciones' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.click(trigger)
  return { trigger, menu: await screen.findByRole('menu') }
}

describe('DropdownMenu global', () => {
  it('abre, navega y ejecuta una acción cerrando el menú', async () => {
    const onEdit = vi.fn()
    render(<Menu onEdit={onEdit} />)
    const { trigger, menu } = await openMenu()
    expect(menu).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Compartir' })).toHaveAttribute('data-disabled')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Abrir' }))
    expect(onEdit).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('cierra con Escape y restaura el foco', async () => {
    render(<Menu />)
    const { trigger, menu } = await openMenu()
    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('admite estado controlado y elementos destructivos', async () => {
    const onOpenChange = vi.fn()
    const onDelete = vi.fn()
    render(
      <DropdownMenu open onOpenChange={onOpenChange}>
        <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem destructive onSelect={onDelete}>Eliminar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await screen.findByRole('menu')
    const item = screen.getByRole('menuitem', { name: 'Eliminar' })
    expect(item).toHaveClass('menu-item-destructive')
    fireEvent.click(item)
    expect(onDelete).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('no falla con un menú vacío', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Vacío</DropdownMenuTrigger>
        <DropdownMenuContent />
      </DropdownMenu>,
    )
    const trigger = screen.getByRole('button', { name: 'Vacío' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(trigger)
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })
})
