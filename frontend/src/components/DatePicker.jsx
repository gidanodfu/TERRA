import { useMemo, useState } from 'react'
import { DayPicker } from '@daypicker/react'
import * as Popover from '@radix-ui/react-popover'
import { es } from 'react-day-picker/locale/es'
import { CalendarDays, X } from 'lucide-react'
import {
  formatDateDisplay,
  formatDateOnly,
  parseDateOnly,
  todayDateOnly,
} from '../utils/date-only'

const spanishPeru = { ...es, code: 'es-PE' }

export default function DatePicker({
  id,
  value = '',
  onChange,
  label,
  placeholder = 'Seleccionar fecha',
  min,
  max,
  disabled = false,
  error,
  clearable = true,
  className = '',
  'aria-label': ariaLabel,
  ...props
}) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parseDateOnly(value) || undefined, [value])
  const minDate = useMemo(() => parseDateOnly(min) || undefined, [min])
  const maxDate = useMemo(() => parseDateOnly(max) || undefined, [max])
  const initialMonth = selected || minDate || maxDate || parseDateOnly(todayDateOnly())
  const disabledMatchers = useMemo(() => {
    const matchers = []
    if (minDate) matchers.push({ before: minDate })
    if (maxDate) matchers.push({ after: maxDate })
    return matchers.length > 0 ? matchers : undefined
  }, [minDate, maxDate])

  const errorId = error && id ? `${id}-error` : undefined
  const display = formatDateDisplay(value)

  const control = (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={`menu-trigger ${error ? 'menu-trigger-error' : ''} ${className}`}
          aria-label={ariaLabel || label || placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...props}
        >
          <span className={`min-w-0 flex-1 truncate text-left ${display ? '' : 'text-slate-400'}`}>
            {display || placeholder}
          </span>
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="menu-content terra-date-picker-panel"
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (!date) return
              onChange?.(formatDateOnly(date))
              setOpen(false)
            }}
            defaultMonth={initialMonth}
            disabled={disabledMatchers}
            weekStartsOn={1}
            locale={spanishPeru}
            showOutsideDays
            className="terra-calendar"
            aria-label={ariaLabel || label || 'Calendario'}
          />
          {clearable && value ? (
            <div className="mt-2 flex justify-end border-t border-slate-200 pt-2">
              <button
                type="button"
                className="btn-ghost min-h-0 px-2 py-1 text-xs"
                onClick={() => {
                  onChange?.('')
                  setOpen(false)
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Limpiar fecha
              </button>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )

  return (
    <div className="min-w-0">
      {label ? <label className="label" htmlFor={id}>{label}</label> : null}
      {control}
      {error ? <p id={errorId} className="field-error">{error}</p> : null}
    </div>
  )
}
