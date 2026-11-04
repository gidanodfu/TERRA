import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, CloudDownload, HardDrive, Play, ShieldAlert } from 'lucide-react'
import { api } from '../../services/api'
import {
  Alert,
  Button,
  Card,
  CardBody,
  Field,
  LoadingBlock,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui'
import { StatusBadge } from '../../features/downloads/StatusBadge'
import FolderPicker from '../../features/drive/FolderPicker'
import { formatDate } from '../../utils/format'

export default function DownloadWizardPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [users, setUsers] = useState(null)
  const [workerId, setWorkerId] = useState(params.get('worker') || '')
  const [connection, setConnection] = useState(undefined)
  const [policy, setPolicy] = useState(null)
  const [scope, setScope] = useState('my_drive_full')
  const [folders, setFolders] = useState([])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get('/admin/users?status=active&page_size=100')
      .then((data) => active && setUsers(data.data || []))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!workerId) {
      setConnection(undefined)
      setPolicy(null)
      return undefined
    }
    let active = true
    setConnection(undefined)
    api
      .get(`/admin/users/${workerId}/drive/connection`)
      .then((data) => {
        if (!active) return
        setConnection(data.connection || null)
        setPolicy(data.policy || null)
      })
      .catch((err) => {
        if (!active) return
        if (err.status === 404 || err.code === 'not_found') {
          setConnection(null)
          setPolicy(null)
        } else {
          setError(err.message)
        }
      })
    return () => {
      active = false
    }
  }, [workerId])

  const worker = users?.find((item) => item.id === workerId)
  const policyCurrent = Boolean(policy && connection?.policy_consent_version === policy.version)
  const ready = Boolean(connection && connection.status === 'connected' && connection.has_refresh_token && policyCurrent)
  const blockingReasons = []
  if (!workerId) blockingReasons.push('Seleccione un trabajador.')
  if (workerId && connection === null) blockingReasons.push('El trabajador no tiene una conexión de Google Drive.')
  if (connection && connection.status !== 'connected') blockingReasons.push('La conexión requiere que el trabajador la reconozca o reautorice.')
  if (connection && policy && !policyCurrent) blockingReasons.push('El trabajador debe aceptar la versión vigente de la política institucional.')
  if (connection && !policy) blockingReasons.push('No existe una política institucional publicada.')

  const create = async () => {
    setError('')
    if (!ready) return
    if (scope === 'selected_folders' && folders.length === 0) {
      setError('Seleccione al menos una carpeta para respaldar.')
      return
    }
    setCreating(true)
    try {
      const body = {
        scope_type: scope,
        root_folder_ids: scope === 'selected_folders' ? folders.map((folder) => folder.id) : [],
      }
      const job = await api.post(`/admin/users/${workerId}/download-jobs`, body, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      navigate(`/app/admin/jobs/${job.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (!users && !error) return <LoadingBlock />

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Nueva descarga institucional"
        description="Seleccione al propietario del Drive y el alcance. El trabajo se procesa de forma asíncrona y conserva la estructura original."
      />
      {error ? <Alert tone="error" onClose={() => setError('')}>{error}</Alert> : null}

      <Card>
        <CardBody>
          <h2 className="font-semibold text-slate-900">Trabajador</h2>
          <p className="mt-1 text-sm text-slate-500">Solo se muestran trabajadores activos con área y cargo asignados.</p>
          <Field label="Trabajador propietario del Drive" htmlFor="worker" error={!workerId ? 'Seleccione un trabajador.' : undefined}>
            <Select id="worker" value={workerId} onChange={(e) => { setWorkerId(e.target.value); setFolders([]) }}>
              <option value="">Seleccione un trabajador</option>
              {(users || []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name || `${user.first_name} ${user.last_name}`} · {user.area_name || 'Sin área'}
                </option>
              ))}
            </Select>
          </Field>
          {users && users.length === 100 ? (
            <p className="mt-1 text-xs text-slate-500">Se muestran los primeros 100 trabajadores activos.</p>
          ) : null}
        </CardBody>
      </Card>

      {workerId ? (
        <Card className="mt-4">
          <CardBody>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Estado de la conexión</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {worker?.display_name || worker?.email || 'Trabajador'} · {worker?.area_name} {worker?.position_name ? `/ ${worker.position_name}` : ''}
                </p>
              </div>
              {connection === undefined ? (
                <Spinner />
              ) : (
                <StatusBadge type="connection" status={connection?.status || 'revoked'} />
              )}
            </div>

            {connection === null ? (
              <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                El trabajador no ha conectado su cuenta de Google Drive. No es posible iniciar una descarga.
                <Button variant="secondary" className="mt-3" onClick={() => navigate(`/app/admin/workers/${workerId}`)}>
                  Revisar trabajador
                </Button>
              </div>
            ) : connection ? (
              <dl className="mt-4 grid gap-3 text-sm @lg:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Cuenta autorizada</dt>
                  <dd className="font-medium text-slate-800">{connection.google_email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Conectada</dt>
                  <dd className="font-medium text-slate-800">{formatDate(connection.connected_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Política aceptada</dt>
                  <dd className="font-medium text-slate-800">
                    {connection.policy_consent_version || 'Pendiente'} {policy ? `(vigente: ${policy.version})` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Token de actualización</dt>
                  <dd className="font-medium text-slate-800">{connection.has_refresh_token ? 'Disponible' : 'No disponible'}</dd>
                </div>
              </dl>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardBody>
          <h2 className="font-semibold text-slate-900">Alcance del snapshot</h2>
          <div className="mt-3 grid gap-3 @lg:grid-cols-2">
            <label className={`cursor-pointer rounded-xl border p-4 ${scope === 'my_drive_full' ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input
                type="radio"
                name="scope"
                className="h-4 w-4 text-brand-700"
                value="my_drive_full"
                checked={scope === 'my_drive_full'}
                onChange={() => setScope('my_drive_full')}
              />
              <span className="ml-2 text-sm font-medium text-slate-900">Mi unidad completa</span>
              <p className="mt-2 text-xs text-slate-500">
                Recorre toda la raíz de Mi unidad, conserva carpetas vacías y excluye la papelera.
              </p>
            </label>
            <label className={`cursor-pointer rounded-xl border p-4 ${scope === 'selected_folders' ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input
                type="radio"
                name="scope"
                className="h-4 w-4 text-brand-700"
                value="selected_folders"
                checked={scope === 'selected_folders'}
                onChange={() => setScope('selected_folders')}
              />
              <span className="ml-2 text-sm font-medium text-slate-900">Carpetas seleccionadas</span>
              <p className="mt-2 text-xs text-slate-500">
                Elija una o varias carpetas. La ruta original desde Mi unidad se conserva.
              </p>
            </label>
          </div>
          {scope === 'selected_folders' ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Selección de carpetas</h3>
              <FolderPicker
                userId={workerId}
                selected={folders}
                onChange={setFolders}
                disabled={!ready || creating}
              />
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody>
          <h2 className="font-semibold text-slate-900">Confirmación</h2>
          {blockingReasons.length > 0 ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <ShieldAlert className="h-4 w-4" /> No es posible iniciar el trabajo todavía
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          ) : (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4" /> Conexión y política vigentes. Puede iniciar el snapshot.
            </div>
          )}

          <div className="mt-4 grid gap-3 text-sm @lg:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Trabajador</p>
              <p className="font-medium text-slate-800">{worker?.display_name || '—'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Alcance</p>
              <p className="font-medium text-slate-800">
                {scope === 'my_drive_full' ? 'Mi unidad completa' : `${folders.length} carpeta(s) seleccionada(s)`}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Clasificación</p>
              <p className="font-medium text-slate-800">{worker?.area_name || '—'} / {worker?.position_name || '—'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Destino</p>
              <p className="break-all font-medium text-slate-800">Snapshot independiente por trabajo</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={create} disabled={!ready || creating || (scope === 'selected_folders' && folders.length === 0)}>
              {creating ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {creating ? 'Registrando trabajo…' : 'Iniciar descarga'}
            </Button>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <HardDrive className="h-3.5 w-3.5" /> El navegador puede cerrarse: el worker continúa en el servidor.
            </p>
          </div>
        </CardBody>
      </Card>

      {!policy ? (
        <div className="mt-4 flex items-start gap-2 text-sm text-slate-500">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>
            No hay política publicada. Publique una versión aprobada en{' '}
            <button type="button" className="font-medium text-brand-700 underline" onClick={() => navigate('/app/admin/policy')}>
              Política institucional
            </button>.
          </span>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
        <CloudDownload className="h-4 w-4" /> Los archivos se descargan de forma asíncrona con límites de velocidad y
        capacidad configurados por la institución.
        <ArrowRight className="h-4 w-4" />
      </div>
    </div>
  )
}
