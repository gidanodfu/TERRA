import { Children, forwardRef, isValidElement } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

const EMPTY_VALUE = '__terra_empty__'

function encodeValue(value) {
  return value === '' || value === null || value === undefined ? EMPTY_VALUE : String(value)
}

function decodeValue(value) {
  return value === EMPTY_VALUE ? '' : value
}

function flattenLabel(value) {
  return Children.toArray(value).map((part) => (typeof part === 'string' || typeof part === 'number' ? part : '')).join('')
}

function optionsFromChildren(children) {
  return Children.toArray(children)
    .filter((child) => isValidElement(child) && child.type === 'option')
    .map((child) => ({
      value: child.props.value ?? '',
      label: flattenLabel(child.props.children),
      disabled: child.props.disabled,
    }))
}

export const Select = forwardRef(function Select(
  {
    id,
    error,
    className = '',
    options = [],
    children,
    value,
    defaultValue,
    onValueChange,
    placeholder = 'Seleccione una opción',
    disabled = false,
    ...props
  },
  ref,
) {
  const controlled = value !== undefined
  const resolvedOptions = options.length > 0 ? options : optionsFromChildren(children)
  return (
    <SelectPrimitive.Root
      value={controlled ? encodeValue(value) : undefined}
      defaultValue={!controlled && defaultValue !== undefined ? encodeValue(defaultValue) : undefined}
      onValueChange={(next) => onValueChange?.(decodeValue(next))}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={id}
        className={`menu-trigger ${error ? 'menu-trigger-error' : ''} ${className}`}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform data-[state=open]:rotate-180" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className="menu-content select-content"
        >
          <SelectPrimitive.Viewport className="select-viewport">
            {resolvedOptions.map((option) => (
              <SelectPrimitive.Item
                key={encodeValue(option.value)}
                value={encodeValue(option.value)}
                disabled={option.disabled}
                className="menu-item select-item"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="select-indicator">
                  <Check className="h-4 w-4" aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
})
