import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { api } from '../services/api'
import { Alert, Button, Field, Input, Spinner } from '../components/ui'
import { Turnstile } from '../features/auth/Turnstile'
import { LEGAL_LINKS } from '../features/legal/links'

const OAUTH_ERRORS = {
  oauth_state: 'La autorización expiró o el estado no es válido. Intente iniciar sesión nuevamente.',
  oauth_denied: 'Se canceló la autorización en Google.',
  oauth_code: 'Google no devolvió un código de autorización.',
  login_failed: 'No fue posible iniciar sesión con Google. Intente nuevamente.',
  account_mismatch: 'La cuenta de Google autorizada no coincide con su cuenta TERRA.',
  drive_connect_failed: 'No fue posible conectar Google Drive. Intente nuevamente.',
}

export default function LoginPage() {
  const { user, loading, apply } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(params.get('error') ? OAUTH_ERRORS[params.get('error')] || 'No fue posible iniciar sesión.' : '')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  if (!loading && user) {
    if (user.status === 'pending_profile') return <Navigate to="/onboarding" replace />
    return <Navigate to={user.roles?.includes('admin') ? '/app/admin' : '/app'} replace />
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    const errors = {}
    if (!form.username.trim()) errors.username = 'Ingrese su usuario.'
    if (!form.password) errors.password = 'Ingrese su contraseña.'
    if (!turnstileToken) errors.turnstile = 'Complete la verificación de seguridad.'
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setSubmitting(true)
    try {
      const data = await api.post('/auth/admin/login', {
        username: form.username.trim(),
        password: form.password,
        turnstile_token: turnstileToken,
      })
      apply(data)
      if (data.must_rotate_password) navigate('/app/security', { replace: true })
      else if (data.pending_profile) navigate('/onboarding', { replace: true })
      else navigate('/app/admin', { replace: true })
    } catch (err) {
      setError(err.message)
      if (err.fields) setFieldErrors(err.fields)
      setTurnstileToken('')
      turnstileRef.current?.reset()
    } finally {
      setSubmitting(false)
    }
  }

  const connectWithGoogle = () => {
    setGoogleLoading(true)
    window.location.assign('/api/v1/auth/google/start')
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-shell px-4 py-8 sm:justify-center sm:px-6 sm:py-10">
      <div className="w-full max-w-[460px]">
        <header className="mb-6 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-700 text-lg font-semibold text-white shadow-sm">
            T
          </span>
          <div className="text-left">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">TERRA</h1>
            <p className="text-sm text-slate-500">Gestión documental</p>
          </div>
        </header>

        <section className="rounded-[20px] border border-slate-200 bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Iniciar sesión</h2>

          {error ? (
            <div className="mt-5">
              <Alert tone="error" title="No se pudo iniciar sesión">
                {error}
              </Alert>
            </div>
          ) : null}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-muted p-5">
            <h3 className="text-center text-sm font-semibold text-slate-900">Trabajadores</h3>
            <button
              type="button"
              className="btn-secondary mt-4 w-full justify-center"
              onClick={connectWithGoogle}
              disabled={googleLoading}
              aria-busy={googleLoading}
            >
              {googleLoading ? <Spinner className="h-4 w-4" /> : <GoogleMark />}
              {googleLoading ? 'Redirigiendo a Google…' : 'Continuar con Google'}
            </button>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-muted p-5">
            <h3 className="text-center text-sm font-semibold text-slate-900">Administración</h3>

            <form onSubmit={submit} noValidate className="mt-4 space-y-4">
              <Field label="Usuario" htmlFor="username" error={fieldErrors.username}>
                <Input
                  id="username"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  error={fieldErrors.username}
                  placeholder="Usuario"
                  disabled={submitting}
                />
              </Field>
              <Field label="Contraseña" htmlFor="password" error={fieldErrors.password}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={fieldErrors.password}
                  placeholder="••••••••••••"
                  disabled={submitting}
                />
              </Field>
              <Field error={fieldErrors.turnstile}>
                <div className="flex justify-center">
                  <Turnstile ref={turnstileRef} onToken={setTurnstileToken} />
                </div>
              </Field>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Spinner className="h-4 w-4" /> : null}
                {submitting ? 'Verificando…' : 'Iniciar sesión'}
                {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
              </Button>
            </form>
          </section>
        </section>

        <div className="mt-5 space-y-1.5 text-center text-xs leading-relaxed text-slate-500">
          <p className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            TERRA no solicita ni almacena contraseñas personales de Google.
          </p>
        </div>

        <section className="@container mt-4 rounded-2xl border border-slate-200 bg-card px-4 py-4 shadow-sm">
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 text-center text-xs text-slate-500 @[18rem]:grid-cols-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.to} className="min-w-0">
                <Link
                  to={link.to}
                  className="inline-block max-w-full rounded py-0.5 text-center underline decoration-slate-300 underline-offset-4 hover:text-brand-800 hover:decoration-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}
