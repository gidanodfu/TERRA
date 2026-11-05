import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Database,
  FileClock,
  HardDrive,
  ListChecks,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../app/AuthContext'
import { PERMISSIONS } from '../../features/auth/permissions'
import { Alert, Card, CardBody, LoadingBlock, PageHeader, StatCard } from '../../components/ui'
import { formatBytes, formatDate } from '../../utils/format'

export default function AdminDashboard() {
  const { can } = useAuth()
  const canCreateJobs = can(PERMISSIONS.JOBS_CREATE)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api
      .get('/admin/dashboard')
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  if (error) return <Alert tone="error">{error}</Alert>
  if (!data) return <LoadingBlock />

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Estado operativo de TERRA: identidades, conexiones, trabajos y almacenamiento institucional."
        actions={canCreateJobs ? (
          <Link to="/app/admin/downloads" className="btn-primary whitespace-nowrap">
            <ArrowRight className="h-4 w-4" /> Nueva descarga
          </Link>
        ) : null}
      />

      <div className="grid gap-4 @sm:grid-cols-2 @3xl:grid-cols-4">
        <StatCard label="Trabajadores activos" value={data.active_users} hint={`${data.pending_profiles} perfiles pendientes`} icon={Users} />
        <StatCard label="Áreas / cargos" value={`${data.areas} / ${data.positions}`} hint="Catálogo organizativo" icon={Database} />
        <StatCard label="Trabajos en curso" value={data.running_jobs + data.queued_jobs} hint={`${data.queued_jobs} en cola · ${data.waiting_authorization_jobs} en espera`} icon={ListChecks} />
        <StatCard label="Almacenamiento" value={formatBytes(data.stored_bytes)} hint="Documentos resguardados" icon={HardDrive} />
      </div>

      <div className="mt-4 grid gap-4 @sm:grid-cols-2 @3xl:grid-cols-4">
        <StatCard label="Completados" value={data.completed_jobs} hint="Snapshots finalizados" icon={FileClock} />
        <StatCard label="Fallidos / parciales" value={data.failed_jobs} hint="Requieren revisión" icon={ShieldAlert} tone="text-amber-600" />
        <StatCard label="Drives conectados" value={data.connected_drives} hint={`${data.reauth_drives} requieren reconexión`} icon={Database} tone="text-emerald-600" />
        <StatCard
          label="Cola más antigua"
          value={data.oldest_queue_age_seconds ? `${Math.round(data.oldest_queue_age_seconds / 60)} min` : '—'}
          hint="Antigüedad del trabajo en espera"
          icon={Activity}
        />
      </div>

      <div className="mt-6 grid gap-6 @3xl:grid-cols-3">
        <Card className="@3xl:col-span-2">
          <CardBody>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Actividad reciente</h2>
              {can(PERMISSIONS.AUDIT_READ) ? (
                <Link to="/app/admin/audit" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                  Ver auditoría <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            {data.recent_activity?.length ? (
              <ul className="divide-y divide-slate-100">
                {data.recent_activity.map((event) => (
                  <li key={event.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{event.action}</p>
                      <p className="text-xs text-slate-500">
                        {event.actor_name || 'Sistema'} · {event.target_type}
                        {event.target_id ? ` · ${event.target_id.slice(0, 8)}` : ''}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-slate-400">{formatDate(event.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">Sin actividad registrada.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="font-semibold text-slate-900">Accesos rápidos</h2>
            <div className="mt-3 space-y-2">
              {can(PERMISSIONS.USERS_READ) ? (
                <Link to="/app/admin/workers" className="btn-secondary w-full justify-start">
                  <Users className="h-4 w-4" /> Trabajadores
                </Link>
              ) : null}
              {can(PERMISSIONS.DRIVE_READ) ? (
                <Link to="/app/admin/connections" className="btn-secondary w-full justify-start">
                  <Database className="h-4 w-4" /> Conexiones de Drive
                </Link>
              ) : null}
              {can(PERMISSIONS.JOBS_READ) ? (
                <Link to="/app/admin/jobs" className="btn-secondary w-full justify-start">
                  <FileClock className="h-4 w-4" /> Historial de trabajos
                </Link>
              ) : null}
              {can(PERMISSIONS.POLICY_WRITE) ? (
                <Link to="/app/admin/policy" className="btn-secondary w-full justify-start">
                  <ShieldAlert className="h-4 w-4" /> Política institucional
                </Link>
              ) : null}
            </div>
            {data.reauth_drives > 0 ? (
              <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                {data.reauth_drives} conexión(es) requieren que el trabajador reconecte su cuenta.
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
