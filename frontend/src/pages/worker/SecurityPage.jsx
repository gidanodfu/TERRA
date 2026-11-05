import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { api } from '../../services/api'
import { Alert, Button, Card, CardBody, DetailRow, Field, Input, PageHeader, Spinner } from '../../components/ui'
import { StatusBadge } from '../../features/downloads/StatusBadge'
import { formatDate } from '../../utils/format'

export default function SecurityPage() {
  const { user, mustRotate, hasLocalCredentials, refresh } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    const next = {}
    if (!form.current_password) next.current_password = 'Ingrese su contraseña actual.'
    if (form.new_password.length < 12) next.new_password = 'Use al menos 12 caracteres.'
    if (form.new_password !== form.confirm) next.confirm = 'Las contraseñas no coinciden.'
    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }
    setSaving(true)
    try {
      await api.post('/auth/password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setForm({ current_password: '', new_password: '', confirm: '' })
      setErrors({})
      setSuccess('Contraseña actualizada. Las demás sesiones fueron cerradas.')
      await refresh()
    } catch (err) {
      setError(err.message)
      if (err.fields) setErrors(err.fields)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Seguridad y sesión" description="Información de su cuenta y gestión de credenciales locales." />

      {mustRotate ? (
        <Alert tone="warning" title="Debe cambiar su contraseña inicial">
          Por seguridad, la contraseña entregada por el administrador es temporal. Establezca una nueva contraseña para
          continuar usando el panel.
        </Alert>
      ) : null}

      <Card>
        <CardBody>
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h2 className="font-semibold text-slate-900">Cuenta</h2>
          </div>
          <dl className="divide-y divide-slate-100">
            <DetailRow label="Nombre">{user?.display_name || '—'}</DetailRow>
            <DetailRow label="Correo">{user?.email || '—'}</DetailRow>
            <DetailRow label="Estado">
              <StatusBadge type="user" status={user?.status} />
            </DetailRow>
            <DetailRow label="Área / Cargo">
              {user?.area_name || '—'} / {user?.position_name || '—'}
            </DetailRow>
            <DetailRow label="Último acceso">{formatDate(user?.last_login_at)}</DetailRow>
          </dl>
          <p className="mt-4 rounded-xl bg-muted p-3 text-xs text-slate-500">
            La sesión se mantiene en una cookie HttpOnly y no es accesible desde JavaScript. No se almacenan tokens de
            Google en el navegador.
          </p>
        </CardBody>
      </Card>

      {hasLocalCredentials ? (
        <Card className="mt-6">
          <CardBody>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Cambiar contraseña</h2>
                <p className="text-xs text-slate-500">Solo para cuentas con credenciales locales.</p>
              </div>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            {success ? <Alert tone="success">{success}</Alert> : null}
            <form onSubmit={submit} noValidate className="space-y-4">
              <Field label="Contraseña actual" htmlFor="current_password" error={errors.current_password}>
                <Input
                  id="current_password"
                  type="password"
                  autoComplete="current-password"
                  value={form.current_password}
                  onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                  error={errors.current_password}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nueva contraseña" htmlFor="new_password" error={errors.new_password} hint="Mínimo 12 caracteres.">
                  <Input
                    id="new_password"
                    type="password"
                    autoComplete="new-password"
                    value={form.new_password}
                    onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                    error={errors.new_password}
                  />
                </Field>
                <Field label="Confirmar contraseña" htmlFor="confirm" error={errors.confirm}>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    error={errors.confirm}
                  />
                </Field>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                Actualizar contraseña
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
