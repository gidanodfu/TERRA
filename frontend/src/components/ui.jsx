import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'

export function PageHeader({ title, description, actions, descriptionClassName = 'max-w-2xl' }) {
  return (
    <div className="mb-6 flex flex-col gap-3 @2xl:flex-row @2xl:items-start @2xl:justify-between">
      <div className="min-w-0">
        <h1 className="wrap-anywhere text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className={`mt-1 ${descriptionClassName} wrap-anywhere text-sm text-slate-500`}>{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function CardBody({ children, className = '' }) {
  return <div className={`card-body ${className}`}>{children}</div>
}

export function Button({ variant = 'primary', className = '', children, ...props }) {
  const classes = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  }[variant]
  return (
    <button className={`${classes} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div className="min-w-0">
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  )
}

export function Input({ id, error, className = '', ...props }) {
  return <input id={id} className={`input ${error ? 'border-red-400' : ''} ${className}`} {...props} />
}

export function Select({ id, error, className = '', children, ...props }) {
  return (
    <select id={id} className={`input ${error ? 'border-red-400' : ''} ${className}`} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ id, error, className = '', ...props }) {
  return <textarea id={id} className={`input min-h-28 ${error ? 'border-red-400' : ''} ${className}`} {...props} />
}

export function Badge({ tone = 'bg-slate-100 text-slate-700', children }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`${className} animate-spin text-brand-700`} aria-hidden="true" />
}

export function LoadingBlock({ label = 'Cargando…' }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-card px-6 py-12 text-center">
      {Icon ? <Icon className="h-9 w-9 text-slate-400" aria-hidden="true" /> : null}
      <div>
        <p className="font-medium text-slate-800">{title}</p>
        {description ? <p className="mt-1 max-w-md break-words text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Alert({ tone = 'error', title, children, onClose }) {
  const styles = {
    error: { box: 'border-red-200 bg-red-50 text-red-800', icon: AlertCircle },
    success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
    info: { box: 'border-sky-200 bg-sky-50 text-sky-800', icon: AlertCircle },
    warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertCircle },
  }[tone]
  const Icon = styles.icon
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${styles.box}`} role="alert">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}

export function ProgressBar({ value, tone = 'bg-brand-600', label }) {
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {label ? <p className="mt-1 text-xs text-slate-500">{label}</p> : null}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        <span className="text-sm text-slate-600">
          {page} / {pages}
        </span>
        <Button variant="secondary" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Página siguiente">
          Siguiente <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 dark:bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-surface-tertiary shadow-xl sm:rounded-2xl" role="dialog" aria-modal="true">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-testid="modal-body">{children}</div>
        {footer ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'text-brand-700' }) {
  return (
    <div className="card min-w-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="wrap-anywhere text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 wrap-anywhere text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="mt-1 wrap-anywhere text-xs text-slate-500">{hint}</p> : null}
        </div>
        {Icon ? <Icon className={`h-6 w-6 shrink-0 ${tone}`} aria-hidden="true" /> : null}
      </div>
    </div>
  )
}

export function DetailRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 wrap-anywhere text-sm font-medium text-slate-800 sm:text-right">{children}</dd>
    </div>
  )
}
