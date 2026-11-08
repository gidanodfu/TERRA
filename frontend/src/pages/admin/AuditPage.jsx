import { useCallback, useEffect, useState } from 'react'
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
import { useAuth } from '../../app/AuthContext'
import { PERMISSIONS } from '../../features/auth/permissions'
import AuditDetailDrawer from '../../features/audit/AuditDetailDrawer'
import { getAuditEventDefinition, getTargetLabel } from '../../features/audit/audit-catalog'

export default function AuditPage() {
  const { can } = useAuth()
  const fullAudit = can(PERMISSIONS.AUDIT_READ)
  const [events, setEvents] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const pageSize = 25
  const closeDetail = useCallback(() => setSelectedEvent(null), [])

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
        description={fullAudit
          ? 'Auditoría institucional completa. No contiene contraseñas, tokens ni contenido documental.'
          : 'Auditoría operacional: trabajadores, conexiones, trabajos y aceptación de políticas. No incluye seguridad, cuentas administrativas ni configuración institucional.'}
      />
      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={search} className="mb-4 flex flex-col gap-2 @2xl:flex-row">
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
                {events.map((event) => {
                  const definition = getAuditEventDefinition(event.action)
                  return (
                    <tr key={event.id} className={`align-top ${selectedEvent?.id === event.id ? 'bg-muted' : ''}`}>
                      <td>
                        <p className="font-medium text-slate-800">{definition.title}</p>
                        <p className="font-mono text-xs text-slate-400">{event.action}</p>
                      </td>
                      <td className="hidden text-sm text-slate-600 sm:table-cell">{event.actor_name || 'Sistema'}</td>
                      <td className="hidden text-xs text-slate-500 md:table-cell">
                        {getTargetLabel(event.target_type)}
                        {event.target_id ? <><br /><span className="font-mono">{event.target_id.slice(0, 8)}…</span></> : null}
                      </td>
                      <td className="whitespace-nowrap text-sm text-slate-500">{formatDate(event.created_at)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="text-sm font-medium text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                          onClick={() => setSelectedEvent(event)}
                          aria-label={`Ver detalle de ${definition.title}`}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </>
      ) : null}

      <AuditDetailDrawer event={selectedEvent} onClose={closeDetail} />
    </div>
  )
}
