import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Building2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { api } from '../services/api'
import { Alert, Button, Card, CardBody, Field, Input } from '../components/ui'
import { Turnstile } from '../features/auth/Turnstile'

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
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(params.get('error') ? OAUTH_ERRORS[params.get('error')] || 'No fue posible iniciar sesión.' : '')
  const [submitting, setSubmitting] = useState(false)

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
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-lg font-bold">T</span>
          <div>
            <p className="text-lg font-semibold tracking-tight">TERRA</p>
            <p className="text-xs text-brand-100">Gestión documental municipal</p>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">
            Respaldo documental institucional, con trazabilidad y control.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            TERRA conserva la estructura original de Google Drive y clasifica cada snapshot por área, cargo y
            trabajador. Los documentos permanecen en el servidor institucional.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-brand-300" /> Autorización individual del propietario del Drive.
            </li>
            <li className="flex items-center gap-3">
              <LockKeyhole className="h-5 w-5 text-brand-300" /> Credenciales y tokens fuera del navegador.
            </li>
            <li className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-brand-300" /> Clasificación administrativa municipal.
            </li>
          </ul>
        </div>
        <p className="relative z-10 text-xs text-brand-200">Portal interno · Acceso restringido</p>
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-700/60 blur-2xl" />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-brand-800/80 blur-2xl" />
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-700 font-bold text-white">T</span>
            <div>
              <p className="font-semibold text-slate-900">TERRA</p>
              <p className="text-xs text-slate-500">Gestión documental municipal</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-slate-500">Acceda con su cuenta institucional o como administrador.</p>

          {error ? (
            <div className="mt-5">
              <Alert tone="error" title="No se pudo iniciar sesión">
                {error}
              </Alert>
            </div>
          ) : null}

          <Card className="mt-5">
            <CardBody>
              <p className="text-sm font-semibold text-slate-900">Trabajadores</p>
              <p className="mt-1 text-xs text-slate-500">Use su cuenta personal de Google autorizada por la institución.</p>
              <a href="/api/v1/auth/google/start" className="btn-secondary mt-4 w-full">
                <GoogleMark /> Continuar con Google
              </a>
            </CardBody>
          </Card>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Administración</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={submit} noValidate>
            <Card>
              <CardBody className="space-y-4">
                <Field label="Usuario" htmlFor="username" error={fieldErrors.username}>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    error={fieldErrors.username}
                    placeholder="admin"
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
                  />
                </Field>
                <Field error={fieldErrors.turnstile}>
                  <Turnstile onToken={setTurnstileToken} />
                </Field>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Verificando…' : 'Entrar como administrador'}
                  {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              </CardBody>
            </Card>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            TERRA no solicita ni almacena contraseñas personales de Google.
          </p>
          <p className="mt-2 text-center text-xs text-slate-400">
            ¿Problemas de acceso? Contacte al administrador del sistema.
          </p>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">
              Portal interno
            </Link>
          </div>
        </div>
      </div>
    </div>
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
