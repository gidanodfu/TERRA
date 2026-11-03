import { useEffect, useState } from 'react'
import { ScrollText, Search } from 'lucide-react'
import { api, queryString } from '../../services/api'
import {
  Alert,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
} from '../../components/ui'
import { formatDate } from '../../utils/format'

export default function AuditPage() {
  const [events, setEvents] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)
  const pageSize = 25

  const search = (event) => {
    event?.preventDefault()
    setPage(1)
    api
      .get(`/admin/audit-events${queryString({ page: 1, page_size: pageSize, action: action.trim(), from, to })}`)
      .then((data) => {
        setEvents(data.data || [])
        setTotal(data.pagination?.total || 0)
        setError('')
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    let active = true
    setEvents(null)
    api
      .get(`/admin/audit-events${queryString({ page, page_size: pageSize, action: action.trim(), from, to })}`)
      .then((data) => {
        if (!active) return
        setEvents(data.data || [])
        setTotal(data.pagination?.total || 0)
        setError('')
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [page, action, from, to])

  return (
    <div>
      <PageHeader
        title="Auditoría"
        description="Registro de operaciones sensibles. No contiene contraseñas, tokens ni contenido documental."
      />
      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={search} className="mb-4 flex flex-col gap-2 lg:flex-row">
        <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Acción exacta, p. ej. download_job.created" aria-label="Filtrar por acción" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
        <Button type="submit" variant="secondary"><Search className="h-4 w-4" /> Filtrar</Button>
      </form>

      {!events && !error ? <LoadingBlock /> : null}
      {events && events.length === 0 ? (
        <EmptyState icon={ScrollText} title="Sin eventos" description="No hay registros de auditoría con estos filtros." />
      ) : null}
      {events && events.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Acción</th>
                  <th className="hidden sm:table-cell">Actor</th>
                  <th className="hidden md:table-cell">Objetivo</th>
                  <th>Fecha</th>
                  <th className="text-right">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="font-medium text-slate-800">{event.action}</td>
                    <td className="hidden text-sm text-slate-600 sm:table-cell">{event.actor_name || 'Sistema'}</td>
                    <td className="hidden text-xs text-slate-500 md:table-cell">
                      {event.target_type}
                      {event.target_id ? <><br />{event.target_id}</> : null}
                    </td>
                    <td className="whitespace-nowrap text-sm text-slate-500">{formatDate(event.created_at)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-brand-700 hover:underline"
                        onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                      >
                        {expanded === event.id ? 'Ocultar' : 'Ver'}
                      </button>
                      {expanded === event.id ? (
                        <pre className="mt-2 max-w-xs overflow-x-auto rounded-lg bg-slate-900 p-2 text-left text-xs text-slate-100">
                          {JSON.stringify(event.metadata || {}, null, 2)}
                        </pre>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </>
      ) : null}
    </div>
  )
}
