import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Cloud, FileText, FolderOpen, HardDrive, ListChecks, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { api } from '../../services/api'
import { Alert, Card, CardBody, LoadingBlock, PageHeader, StatCard } from '../../components/ui'
import { StatusBadge } from '../../features/downloads/StatusBadge'
import { formatBytes, formatDate } from '../../utils/format'

export default function WorkerHome() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/me/drive/connection'),
      api.get('/download-jobs?page_size=5'),
      api.get('/me/stored-files?page_size=1'),
    ])
      .then(([drive, jobs, files]) => {
        if (active) setData({ drive, jobs, files })
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <LoadingBlock />

  const connection = data.drive.connection
  const jobs = data.jobs.data || []
  const totalFiles = data.files.pagination?.total || 0
  const activeJobs = jobs.filter((job) => !['completed', 'partially_completed', 'failed', 'cancelled'].includes(job.status))

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.first_name || user?.display_name || 'bienvenido'}`}
        description="Consulte el estado de su conexión, sus descargas y los documentos resguardados por TERRA."
      />

      <div className="grid gap-4 @sm:grid-cols-2 @3xl:grid-cols-4">
        <StatCard
          label="Conexión de Google Drive"
          value={connection ? 'Vinculada' : 'Sin conectar'}
          hint={connection?.google_email || 'Autorice su cuenta para permitir respaldos'}
          icon={HardDrive}
        />
        <StatCard label="Trabajos activos" value={activeJobs.length} hint="Descargas en curso o en cola" icon={ListChecks} />
        <StatCard label="Documentos disponibles" value={totalFiles} hint="Archivos resguardados en el servidor" icon={FileText} />
        <StatCard
          label="Política institucional"
          value={connection?.policy_consent_version ? 'Aceptada' : 'Pendiente'}
          hint={data.drive.policy ? `Versión vigente ${data.drive.policy.version}` : 'Sin versión publicada'}
          icon={ShieldCheck}
        />
      </div>

      <div className="mt-6 grid gap-6 @3xl:grid-cols-3">
        <Card className="@3xl:col-span-2">
          <CardBody>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Descargas recientes</h2>
              <Link to="/app/jobs" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                Ver todas <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            {jobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Todavía no hay descargas asociadas a su cuenta.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {jobs.map((job) => (
                  <li key={job.id} className="flex flex-col gap-2 py-3 @md:flex-row @md:items-center @md:justify-between">
                    <div className="min-w-0">
                      <Link to={`/app/jobs/${job.id}`} className="truncate text-sm font-medium text-brand-800 hover:underline">
                        Trabajo {job.id.slice(0, 8).toUpperCase()}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(job.created_at)} · {job.total_items} elementos · {formatBytes(job.downloaded_bytes)}
                      </p>
                    </div>
                    <StatusBadge type="job" status={job.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold text-slate-900">Su cuenta</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Área</dt>
                <dd className="font-medium text-slate-800">{user?.area_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Cargo</dt>
                <dd className="font-medium text-slate-800">{user?.position_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Correo</dt>
                <dd className="break-all font-medium text-slate-800">{user?.email || '—'}</dd>
              </div>
            </dl>
            <div className="mt-5 space-y-2">
              <Link to="/app/drive" className="btn-secondary w-full">
                <Cloud className="h-4 w-4" /> Gestionar Google Drive
              </Link>
              <Link to="/app/documents" className="btn-secondary w-full">
                <FolderOpen className="h-4 w-4" /> Mis documentos
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
