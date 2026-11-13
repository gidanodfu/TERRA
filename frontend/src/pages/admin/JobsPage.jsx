import { useEffect, useState } from 'react'
import { FileClock, Search } from 'lucide-react'
import { api, queryString } from '../../services/api'
import {
  Alert,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
  Select,
} from '../../components/ui'
import JobTable from '../../features/downloads/JobTable'
import DatePicker from '../../components/DatePicker'
import { isValidDateRange } from '../../utils/date-only'

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [areaId, setAreaId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [areas, setAreas] = useState([])
  const [positions, setPositions] = useState([])
  const [error, setError] = useState('')
  const pageSize = 20
  const rangeValid = isValidDateRange(from, to)
  const rangeError = rangeValid ? undefined : 'La fecha Desde no puede ser posterior a Hasta.'

  useEffect(() => {
    api.get('/admin/areas').then((data) => setAreas(data.data || [])).catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!areaId) { setPositions([]); setPositionId(''); return undefined }
    let active = true
    api.get(`/admin/areas/${areaId}/positions`).then((data) => active && setPositions(data.data || [])).catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [areaId])

  useEffect(() => {
    if (!rangeValid) return undefined
    let active = true
    setJobs(null)
    api
      .get(`/admin/download-jobs${queryString({ page, page_size: pageSize, status, q: applied, area_id: areaId, position_id: positionId, from, to })}`)
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
  }, [page, status, applied, areaId, positionId, from, to, rangeValid])

  return (
    <div>
      <PageHeader
        title="Trabajos de descarga"
        description="Historial completo de snapshots. Cada ejecución conserva el solicitante, el propietario del Drive y la clasificación municipal."
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mb-4 flex flex-col gap-2 @lg:flex-row">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setApplied(search.trim())
          }}
        >
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por trabajador o solicitante" aria-label="Buscar trabajos" />
          <Button type="submit" variant="secondary"><Search className="h-4 w-4" /> Buscar</Button>
        </form>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1) }} aria-label="Filtrar por estado" className="@lg:w-56">
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
      </div>
      <div className="mb-4 grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-4">
        <Select value={areaId} onValueChange={(value) => { setAreaId(value); setPage(1) }} aria-label="Filtrar por área">
          <option value="">Todas las áreas</option>
          {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
        </Select>
        <Select value={positionId} onValueChange={(value) => { setPositionId(value); setPage(1) }} aria-label="Filtrar por cargo" disabled={!areaId}>
          <option value="">Todos los cargos</option>
          {positions.map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
        </Select>
        <DatePicker id="jobs-from" value={from} onChange={(value) => { setFrom(value); setPage(1) }} max={to || undefined} error={rangeError} aria-label="Desde" />
        <DatePicker id="jobs-to" value={to} onChange={(value) => { setTo(value); setPage(1) }} min={from || undefined} error={rangeError} aria-label="Hasta" />
      </div>
      {!jobs && !error ? <LoadingBlock /> : null}
      {jobs && jobs.length === 0 ? (
        <EmptyState icon={FileClock} title="Sin trabajos" description="Aún no se han ejecutado descargas con estos filtros." />
      ) : null}
      {jobs && jobs.length > 0 ? (
        <>
          <JobTable jobs={jobs} basePath="/app/admin/jobs" showOwner />
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
        </>
      ) : null}
    </div>
  )
}
