import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Database, Save, UserRound } from 'lucide-react'
import { api } from '../../services/api'
import {
  Alert,
  Button,
  Card,
  CardBody,
  DetailRow,
  Field,
  LoadingBlock,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui'
import { StatusBadge } from '../../features/downloads/StatusBadge'
import { isWorkerAccount } from '../../features/auth/roles'
import { PERMISSIONS } from '../../features/auth/permissions'
import { useAuth } from '../../app/AuthContext'
import { formatDate } from '../../utils/format'

export default function WorkerDetailPage() {
  const { can } = useAuth()
  const { id } = useParams()
  const [detail, setDetail] = useState(null)
  const [areas, setAreas] = useState([])
  const [positions, setPositions] = useState([])
  const [form, setForm] = useState({ area_id: '', position_id: '', status: 'active' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/admin/users/${id}`)
      setDetail(data)
      setForm({
        area_id: data.user.area_id || '',
        position_id: data.user.position_id || '',
        status: data.user.status,
      })
      setErrors({})
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => {
    load()
    api
      .get('/admin/areas')
      .then((data) => setAreas(data.data || []))
      .catch((err) => setError(err.message))
  }, [load])

  useEffect(() => {
    if (!form.area_id) {
      setPositions([])
      return undefined
    }
    let active = true
    api
      .get(`/admin/areas/${form.area_id}/positions`)
      .then((data) => {
        if (!active) return
        setPositions(data.data || [])
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [form.area_id])

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const save = async (event) => {
    event.preventDefault()
    setError('')
    setErrors({})
    setSuccess('')
    setSaving(true)
    try {
      await api.patch(`/admin/users/${id}`, {
        area_id: form.area_id || null,
        position_id: form.position_id || null,
        status: form.status,
      })
      setSuccess('Trabajador actualizado. La asignación quedó registrada en el historial.')
      await load()
    } catch (err) {
      setError(err.message)
      if (err.fields) setErrors(err.fields)
    } finally {
      setSaving(false)
    }
  }

  if (!detail && !error) return <LoadingBlock />
  if (!detail) return <Alert tone="error">{error}</Alert>

  const { user, drive_connection: connection, organization_history: history } = detail
  const isWorker = isWorkerAccount(user)
  const canWrite = can(PERMISSIONS.USERS_WRITE)
  const canCreateJob = can(PERMISSIONS.JOBS_CREATE)

  if (!isWorker) {
    return (
      <div>
        <Link to="/app/admin/workers" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Volver a trabajadores
        </Link>
        <Alert tone="error">
          Esta cuenta es administrativa y no forma parte del módulo de trabajadores. Su estado se gestiona
          desde la administración de cuentas.
        </Alert>
      </div>
    )
  }

  return (
    <div>
      <Link to="/app/admin/workers" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Volver a trabajadores
      </Link>
      <PageHeader
        title={user.display_name || `${user.first_name} ${user.last_name}`}
        description={`${user.email || 'Sin correo'} · ${user.area_name || 'Sin área'} / ${user.position_name || 'Sin cargo'}`}
        actions={
          isWorker && canCreateJob && user.status === 'active' ? (
            <Link to={`/app/admin/downloads?worker=${user.id}`} className="btn-primary">
              <ArrowRight className="h-4 w-4" /> Iniciar descarga
            </Link>
          ) : null
        }
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess('')}>{success}</Alert> : null}

      <div className="grid gap-6 @3xl:grid-cols-3">
        <Card className="@3xl:col-span-2">
          <CardBody>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <UserRound className="h-5 w-5" />
              </span>
              <h2 className="font-semibold text-slate-900">Datos y asignación</h2>
            </div>
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Estado"><StatusBadge type="user" status={user.status} /></DetailRow>
              <DetailRow label="Área">{user.area_name || '—'}</DetailRow>
              <DetailRow label="Cargo">{user.position_name || '—'}</DetailRow>
              <DetailRow label="Alta">{formatDate(user.created_at)}</DetailRow>
              <DetailRow label="Último acceso">{formatDate(user.last_login_at)}</DetailRow>
            </dl>

            {canWrite ? (
            <form onSubmit={save} className="mt-6 space-y-4 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-900">Modificar asignación</h3>
              <div className="grid gap-4 @md:grid-cols-2">
                <Field label="Área" htmlFor="area_id" error={errors.area_id}>
                  <Select
                    id="area_id"
                    value={form.area_id}
                    onValueChange={(value) => { update('area_id', value); update('position_id', '') }}
                    error={errors.area_id}
                  >
                    <option value="">Sin área</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>{area.name}{area.status === 'inactive' ? ' (inactiva)' : ''}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Cargo" htmlFor="position_id" error={errors.position_id}>
                  <Select
                    id="position_id"
                    value={form.position_id}
                    onValueChange={(value) => update('position_id', value)}
                    disabled={!form.area_id}
                    error={errors.position_id}
                  >
                    <option value="">Sin cargo</option>
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.name}{position.status === 'inactive' ? ' (inactivo)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Estado de la cuenta" htmlFor="status" error={errors.status} hint="Suspender o desactivar invalida todas las sesiones activas.">
                <Select id="status" value={form.status} onValueChange={(value) => update('status', value)} error={errors.status}>
                  <option value="active">Activo</option>
                  <option value="pending_profile">Perfil pendiente</option>
                  <option value="suspended">Suspendido</option>
                  <option value="disabled">Desactivado</option>
                </Select>
              </Field>
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Guardar cambios
              </Button>
            </form>
            ) : (
              <p className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500">Su rol permite consultar este trabajador, pero no modificar su asignación ni su estado.</p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardBody>
              <div className="mb-3 flex items-center gap-3">
                <Database className="h-5 w-5 text-brand-700" />
                <h2 className="font-semibold text-slate-900">Google Drive</h2>
              </div>
              {connection ? (
                <>
                  <div className="mb-3"><StatusBadge type="connection" status={connection.status} /></div>
                  <dl className="divide-y divide-slate-100">
                    <DetailRow label="Cuenta">{connection.google_email || '—'}</DetailRow>
                    <DetailRow label="Conectado">{formatDate(connection.connected_at)}</DetailRow>
                    <DetailRow label="Política">{connection.policy_consent_version || 'Pendiente'}</DetailRow>
                    <DetailRow label="Token">{connection.has_refresh_token ? 'Disponible (cifrado)' : 'No disponible'}</DetailRow>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-slate-500">El trabajador no ha conectado su cuenta de Google Drive.</p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                Solo el trabajador puede autorizar o reconectar su cuenta. El administrador nunca suplanta su identidad.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="font-semibold text-slate-900">Historial organizativo</h2>
              {history?.length ? (
                <ul className="mt-3 space-y-3">
                  {history.map((entry) => (
                    <li key={entry.id} className="rounded-xl bg-muted p-3 text-sm">
                      <p className="font-medium text-slate-800">
                        {entry.area_name || 'Sin área'} / {entry.position_name || 'Sin cargo'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Antes: {entry.previous_area_name || '—'} / {entry.previous_position_name || '—'}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(entry.created_at)} · {entry.actor_name || 'Sistema'}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Sin cambios organizativos registrados.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
