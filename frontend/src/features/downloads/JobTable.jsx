import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { StatusBadge, ScopeLabel } from './StatusBadge'
import { formatBytes, formatDate, progressIsIndeterminate, progressPercent } from '../../utils/format'
import { useRealtimeJobs } from '../realtime/RealtimeContext'
import { ProgressBar } from '../../components/ui'

export default function JobTable({ jobs, basePath, showOwner = false }) {
  const updates = useRealtimeJobs(jobs)
  const rows = jobs.map((job) => ({ ...job, ...(updates[job.id] || {}) }))
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="min-w-44">Trabajo</th>
            {showOwner ? <th className="min-w-44">Trabajador</th> : null}
            <th className="min-w-40">Alcance</th>
            <th className="w-28">Estado</th>
            <th className="min-w-56">Progreso</th>
            <th className="hidden min-w-36 md:table-cell">Fecha</th>
            <th className="sr-only">Abrir</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((job) => (
            <tr key={job.id} className="hover:bg-muted">
              <td>
                <Link to={`${basePath}/${job.id}`} className="font-medium text-brand-800 hover:underline">
                  {job.id.slice(0, 8).toUpperCase()}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {job.total_items} elementos · {formatBytes(job.downloaded_bytes)}
                </p>
              </td>
              {showOwner ? (
                <td>
                  <p className="font-medium text-slate-800">{job.drive_owner_name || '—'}</p>
                  <p className="text-xs text-slate-500">
                    {job.area_name} · {job.position_name}
                  </p>
                </td>
              ) : null}
              <td className="text-sm text-slate-600">
                <ScopeLabel scope={job.scope_type} />
                {job.roots?.length || job.file_roots?.length ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {job.roots?.length || 0} carpeta(s) · {job.file_roots?.length || 0} archivo(s)
                  </p>
                ) : null}
              </td>
              <td>
                <StatusBadge type="job" status={job.status} />
              </td>
              <td className="min-w-40">
                <ProgressBar
                  value={progressPercent(job)}
                  indeterminate={progressIsIndeterminate(job) && !['completed', 'partially_completed', 'failed', 'cancelled'].includes(job.status)}
                  label={job.progress
                    ? job.progress.byte_progress_percent !== null
                      ? `${formatBytes(job.progress.transferred_bytes)} / ${formatBytes(job.progress.known_total_bytes)} · ${job.completed_items}/${job.total_items} archivos`
                      : `${formatBytes(job.progress.transferred_bytes)} transferidos · ${job.progress.unknown_size_items} sin tamaño · ${job.completed_items}/${job.total_items} archivos`
                    : `${job.completed_items}/${job.total_items} completados`}
                />
              </td>
              <td className="hidden whitespace-nowrap text-sm text-slate-500 md:table-cell">{formatDate(job.created_at)}</td>
              <td className="text-right">
                <Link
                  to={`${basePath}/${job.id}`}
                  className="inline-flex rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Abrir trabajo ${job.id}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
