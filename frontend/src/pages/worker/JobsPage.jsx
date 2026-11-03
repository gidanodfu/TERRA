import { useEffect, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { api, queryString } from '../../services/api'
import { Alert, EmptyState, LoadingBlock, PageHeader, Pagination, Select } from '../../components/ui'
import JobTable from '../../features/downloads/JobTable'

export default function WorkerJobs() {
  const [jobs, setJobs] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const pageSize = 20

  useEffect(() => {
    let active = true
    setJobs(null)
    api
      .get(`/download-jobs${queryString({ page, page_size: pageSize, status })}`)
      .then((data) => {
        if (!active) return
        setJobs(data.data || [])
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
        title="Mis descargas"
        description="Historial de respaldos institucionales asociados a su cuenta. Cada trabajo genera un snapshot independiente."
        actions={
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="queued">En cola</option>
            <option value="scanning">Explorando</option>
            <option value="downloading">Descargando</option>
            <option value="waiting_authorization">Esperando autorización</option>
            <option value="completed">Completados</option>
            <option value="partially_completed">Parciales</option>
            <option value="failed">Fallidos</option>
            <option value="cancelled">Cancelados</option>
          </Select>
        }
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!jobs && !error ? <LoadingBlock /> : null}
      {jobs && jobs.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Sin descargas registradas"
          description="Cuando un administrador inicie un respaldo de su Drive, el trabajo aparecerá aquí con su progreso."
        />
      ) : null}
      {jobs && jobs.length > 0 ? (
        <>
          <JobTable jobs={jobs} basePath="/app/jobs" />
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </>
      ) : null}
    </div>
  )
}
