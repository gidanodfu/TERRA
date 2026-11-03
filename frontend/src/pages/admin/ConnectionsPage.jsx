import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database } from 'lucide-react'
import { api, queryString } from '../../services/api'
import { Alert, EmptyState, LoadingBlock, PageHeader, Pagination, Select } from '../../components/ui'
import { StatusBadge } from '../../features/downloads/StatusBadge'
import { formatDate } from '../../utils/format'

export default function ConnectionsPage() {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const pageSize = 20

  useEffect(() => {
    let active = true
    setRows(null)
    api
      .get(`/admin/drive-connections${queryString({ page, page_size: pageSize, status })}`)
      .then((data) => {
        if (!active) return
        setRows(data.data || [])
        setTotal(data.pagination?.total || 0)
        setError('')
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [page, status])

  return (
    <div>
      <PageHeader
        title="Conexiones de Google Drive"
        description="Autorizaciones individuales de los trabajadores. TERRA nunca utiliza credenciales propias para acceder al Drive de otra persona."
        actions={
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filtrar conexiones">
            <option value="">Todas</option>
            <option value="connected">Conectadas</option>
            <option value="reauthorization_required">Requieren reconexión</option>
            <option value="revoked">Revocadas</option>
            <option value="error">Con error</option>
          </Select>
        }
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!rows && !error ? <LoadingBlock /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Sin conexiones registradas"
          description="Las conexiones aparecen cuando cada trabajador autoriza individualmente su cuenta de Google Drive."
        />
      ) : null}
      {rows && rows.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th className="hidden sm:table-cell">Cuenta Google</th>
                  <th>Estado</th>
                  <th className="hidden md:table-cell">Política</th>
                  <th className="hidden lg:table-cell">Conectada</th>
                  <th className="hidden lg:table-cell">Última renovación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td>
                      <Link to={`/app/admin/workers/${row.user_id}`} className="font-medium text-brand-800 hover:underline">
                        {row.user_name || 'Trabajador'}
                      </Link>
                      <p className="text-xs text-slate-500">{row.area_name} {row.position_name ? `· ${row.position_name}` : ''}</p>
                    </td>
                    <td className="hidden text-sm text-slate-600 sm:table-cell">{row.google_email || '—'}</td>
                    <td><StatusBadge type="connection" status={row.status} /></td>
                    <td className="hidden text-sm text-slate-600 md:table-cell">
                      {row.policy_consent_version || <span className="text-amber-700">Pendiente</span>}
                    </td>
                    <td className="hidden whitespace-nowrap text-sm text-slate-500 lg:table-cell">{formatDate(row.connected_at)}</td>
                    <td className="hidden whitespace-nowrap text-sm text-slate-500 lg:table-cell">{formatDate(row.last_refreshed_at)}</td>
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
