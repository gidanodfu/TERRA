import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, RefreshCw, RotateCcw, WifiOff } from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { PERMISSIONS } from '../features/auth/permissions'
import { api, queryString } from '../services/api'
import {
  Alert,
  Button,
  Card,
  CardBody,
  DetailRow,
  LoadingBlock,
  PageHeader,
  Pagination,
  ProgressBar,
  Select,
  Spinner,
} from '../components/ui'
import { StatusBadge, ScopeLabel } from '../features/downloads/StatusBadge'
import { useJobEvents } from '../features/downloads/useJobEvents'
import { formatBytes, formatDate, durationBetween, isTerminal, progressPercent } from '../utils/format'

const ACTIVE = ['queued', 'scanning', 'downloading', 'waiting_authorization', 'cancel_requested']

export default function JobDetailPage({ basePath }) {
  const { id } = useParams()
  const { can } = useAuth()
  const adminView = basePath.startsWith('/app/admin')
  const [job, setJob] = useState(null)
  const [items, setItems] = useState(null)
  const [itemTotal, setItemTotal] = useState(0)
  const [itemStatus, setItemStatus] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const pageSize = 25
  const itemsSignature = useRef('')

  const onSnapshot = useCallback((payload) => {
    setJob((current) => ({ ...(current || {}), ...payload }))
  }, [])
  const connected = useJobEvents(id, onSnapshot)

  const loadJob = useCallback(async () => {
    try {
      const data = await api.get(`/download-jobs/${id}`)
      setJob(data)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => {
    loadJob()
  }, [loadJob])

  useEffect(() => {
    const signature = `${job?.completed_items}-${job?.failed_items}-${job?.skipped_items}-${job?.status}-${page}-${itemStatus}`
    if (signature === itemsSignature.current) return undefined
    itemsSignature.current = signature
    let active = true
    api
      .get(`/download-jobs/${id}/items${queryString({ page, page_size: pageSize, status: itemStatus })}`)
      .then((data) => {
        if (!active) return
        setItems(data.data || [])
        setItemTotal(data.pagination?.total || 0)
      })
      .catch((err) => active && setActionError(err.message))
    return () => {
      active = false
    }
  }, [id, job?.completed_items, job?.failed_items, job?.skipped_items, job?.status, page, itemStatus])

  // Respaldo por polling cuando SSE no está disponible o se está reconectando.
  useEffect(() => {
    if (!job || isTerminal(job.status) || connected) return undefined
    const timer = setInterval(loadJob, 5000)
    return () => clearInterval(timer)
  }, [job, connected, loadJob])

  const cancel = async () => {
    setActionError('')
    setBusy(true)
    try {
      const updated = await api.post(`/download-jobs/${id}/cancel`)
      setJob(updated)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const retry = async () => {
    setActionError('')
    setBusy(true)
    try {
      const updated = await api.post(`/download-jobs/${id}/retry-failed`)
      setJob(updated)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!job && !error) return <LoadingBlock />
  if (error && !job) return <Alert tone="error">{error}</Alert>

  const active = ACTIVE.includes(job.status)
  const percent = progressPercent(job)
  const tone = job.status === 'failed' ? 'bg-red-500' : job.status === 'partially_completed' ? 'bg-amber-500' : 'bg-brand-600'

  return (
    <div className="w-full min-w-0 max-w-none">
      <Link to={basePath} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Volver a trabajos
      </Link>
      <PageHeader
        title={`Trabajo ${job.id.slice(0, 8).toUpperCase()}`}
        description={`${job.area_name} · ${job.position_name} · solicitado por ${job.requested_by_name}`}
        actions={
          <>
            {!connected && !isTerminal(job.status) ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
                <WifiOff className="h-4 w-4" /> Sincronización por REST
              </span>
            ) : null}
            {active && (!adminView || can(PERMISSIONS.JOBS_CANCEL)) ? (
              <Button variant="danger" onClick={cancel} disabled={busy || job.status === 'cancel_requested'}>
                {busy ? <Spinner className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {job.status === 'cancel_requested' ? 'Cancelación solicitada' : 'Cancelar trabajo'}
              </Button>
            ) : null}
            {adminView && can(PERMISSIONS.JOBS_RETRY) && ['failed', 'partially_completed'].includes(job.status) ? (
              <Button variant="secondary" onClick={retry} disabled={busy}>
                <RotateCcw className="h-4 w-4" /> Reintentar fallidos
              </Button>
            ) : null}
            <Button variant="secondary" onClick={loadJob} disabled={busy}>
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
          </>
        }
      />

      {actionError ? <Alert tone="error">{actionError}</Alert> : null}

      {job.status === 'waiting_authorization' ? (
        <Alert tone="warning" title="El trabajo está en espera de autorización">
          El propietario del Drive debe reconectar su cuenta de Google Drive y aceptar la política institucional vigente.
          {adminView ? (
            <>
              {' '}
              <Link className="font-semibold underline" to={`/app/admin/workers/${job.drive_owner_user_id}`}>
                Revisar trabajador
              </Link>
            </>
          ) : (
            <>
              {' '}
              <Link className="font-semibold underline" to="/app/drive">
                Reconectar Google Drive
              </Link>
            </>
          )}
        </Alert>
      ) : null}
      {job.error_message ? <Alert tone="error" title={job.error_code || 'Error del trabajo'}>{job.error_message}</Alert> : null}

      <div className="grid gap-6 @3xl:grid-cols-3">
        <Card className="@3xl:col-span-2">
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusBadge type="job" status={job.status} />
                <span className="text-sm text-slate-500">{ScopeLabel({ scope: job.scope_type })}</span>
              </div>
              <span className="text-sm font-medium text-slate-700">
                {job.completed_items + job.skipped_items + job.failed_items} / {job.total_items} elementos
              </span>
            </div>
            <div className="mt-4">
              <ProgressBar value={percent} tone={tone} label={`${percent}% procesado · ${formatBytes(job.downloaded_bytes)} descargados`} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 @2xl:grid-cols-4">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Completados</p>
                <p className="text-xl font-semibold text-emerald-900">{job.completed_items}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs text-amber-700">Omitidos</p>
                <p className="text-xl font-semibold text-amber-900">{job.skipped_items}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="text-xs text-red-700">Fallidos</p>
                <p className="text-xl font-semibold text-red-900">{job.failed_items}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs text-slate-600">Tamaño total</p>
                <p className="text-xl font-semibold text-slate-900">{formatBytes(job.total_bytes)}</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold text-slate-900">Detalles</h2>
            <dl className="mt-2 divide-y divide-slate-100">
              <DetailRow label="Trabajador">{job.drive_owner_name}</DetailRow>
              <DetailRow label="Solicitante">{job.requested_by_name}</DetailRow>
              <DetailRow label="Creado">{formatDate(job.created_at)}</DetailRow>
              <DetailRow label="Inicio">{formatDate(job.started_at)}</DetailRow>
              <DetailRow label="Fin">{formatDate(job.finished_at)}</DetailRow>
              <DetailRow label="Duración">{durationBetween(job.started_at, job.finished_at)}</DetailRow>
              <DetailRow label="Descargado">{formatBytes(job.downloaded_bytes)}</DetailRow>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardBody>
          <h2 className="font-semibold text-slate-900">Alcance del snapshot</h2>
          {job.scope_type === 'my_drive_full' ? (
            <p className="mt-2 text-sm text-slate-600">
              Se respalda la totalidad de <strong>Mi unidad</strong>, preservando todas las carpetas y archivos permitidos.
            </p>
          ) : job.roots?.length || job.file_roots?.length ? (
            <div className="mt-3 grid gap-3 @2xl:grid-cols-2">
              {job.roots?.length ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carpetas raíz</h3>
                  <ul className="mt-2 space-y-2">
                    {job.roots.map((root) => (
                      <li key={root.google_folder_id} className="rounded-xl bg-muted px-3 py-2 text-sm">
                        <p className="font-medium text-slate-800">Mi unidad / {root.source_path}</p>
                        <p className="text-xs text-slate-500">Drive ID: {root.google_folder_id}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {job.file_roots?.length ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Archivos individuales</h3>
                  <ul className="mt-2 space-y-2">
                    {job.file_roots.map((root) => (
                      <li key={root.google_file_id} className="rounded-xl bg-muted px-3 py-2 text-sm">
                        <p className="font-medium text-slate-800">Mi unidad / {root.source_path}</p>
                        <p className="text-xs text-slate-500">Drive ID: {root.google_file_id}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Sin raíces registradas.</p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody>
          <div className="mb-4 flex flex-col gap-2 @md:flex-row @md:items-center @md:justify-between">
            <h2 className="font-semibold text-slate-900">Elementos</h2>
            <Select
              value={itemStatus}
              onChange={(e) => {
                setItemStatus(e.target.value)
                setPage(1)
              }}
              aria-label="Filtrar elementos"
              className="@md:w-52"
            >
              <option value="">Todos</option>
              <option value="completed">Completados</option>
              <option value="pending">Pendientes</option>
              <option value="downloading">Descargando</option>
              <option value="retrying">Reintentando</option>
              <option value="skipped">Omitidos</option>
              <option value="failed">Fallidos</option>
              <option value="cancelled">Cancelados</option>
            </Select>
          </div>
          {!items ? (
            <LoadingBlock label="Cargando elementos…" />
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay elementos con este filtro.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Estado</th>
                      <th className="hidden sm:table-cell">Intentos</th>
                      <th className="hidden md:table-cell">Tamaño</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <p className="max-w-md truncate font-medium text-slate-800" title={item.name}>
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-500">{item.mime_type}</p>
                        </td>
                        <td><StatusBadge type="item" status={item.status} /></td>
                        <td className="hidden text-sm text-slate-600 sm:table-cell">{item.attempt_count}</td>
                        <td className="hidden whitespace-nowrap text-sm text-slate-600 md:table-cell">
                          {formatBytes(item.size_bytes)}
                        </td>
                        <td className="text-xs text-slate-500">
                          {item.error_message ? (
                            <>
                              <span className="font-medium text-slate-700">{item.error_code}</span>
                              <br />
                              {item.error_message}
                            </>
                          ) : item.sha256 ? (
                            <span className="font-mono">{item.sha256.slice(0, 16)}…</span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={pageSize} total={itemTotal} onPage={setPage} />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
