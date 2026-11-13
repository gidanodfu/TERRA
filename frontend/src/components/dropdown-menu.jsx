import { forwardRef } from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'

export const DropdownMenu = DropdownMenuPrimitive.Root

export const DropdownMenuGroup = DropdownMenuPrimitive.Group

export const DropdownMenuTrigger = forwardRef(function DropdownMenuTrigger(
  { className = '', children, asChild = false, ...props },
  ref,
) {
  if (asChild) {
    return (
      <DropdownMenuPrimitive.Trigger ref={ref} asChild {...props}>
        {children}
      </DropdownMenuPrimitive.Trigger>
    )
  }
  return (
    <DropdownMenuPrimitive.Trigger ref={ref} className={`menu-trigger ${className}`} {...props}>
      {children}
    </DropdownMenuPrimitive.Trigger>
  )
})

export const DropdownMenuContent = forwardRef(function DropdownMenuContent(
  { className = '', align = 'end', sideOffset = 6, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={`menu-content ${className}`}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
})

export const DropdownMenuItem = forwardRef(function DropdownMenuItem(
  { className = '', destructive = false, icon: Icon, children, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={`menu-item ${destructive ? 'menu-item-destructive' : ''} ${className}`}
      {...props}
    >
      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenuPrimitive.Item>
  )
})

export const DropdownMenuLabel = forwardRef(function DropdownMenuLabel({ className = '', ...props }, ref) {
  return <DropdownMenuPrimitive.Label ref={ref} className={`menu-label ${className}`} {...props} />
})

export const DropdownMenuSeparator = forwardRef(function DropdownMenuSeparator({ className = '', ...props }, ref) {
  return <DropdownMenuPrimitive.Separator ref={ref} className={`menu-separator ${className}`} {...props} />
})
