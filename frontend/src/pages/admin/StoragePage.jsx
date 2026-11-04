import { useEffect, useState } from 'react'
import { Download, HardDrive } from 'lucide-react'
import { api, queryString } from '../../services/api'
import { Alert, EmptyState, LoadingBlock, PageHeader, Pagination } from '../../components/ui'
import { formatBytes, formatDate } from '../../utils/format'

export default function StoragePage() {
  const [files, setFiles] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const pageSize = 25

  useEffect(() => {
    let active = true
    setFiles(null)
    api
      .get(`/admin/storage${queryString({ page, page_size: pageSize })}`)
      .then((data) => {
        if (!active) return
        setFiles(data.data || [])
        setTotal(data.pagination?.total || 0)
        setError('')
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [page])

  return (
    <div>
      <PageHeader
        title="Almacenamiento documental"
        description="Documentos privados resguardados en el volumen institucional. El acceso siempre pasa por la API autenticada y queda auditado."
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!files && !error ? <LoadingBlock /> : null}
      {files && files.length === 0 ? (
        <EmptyState icon={HardDrive} title="Almacenamiento vacío" description="Los documentos aparecerán al completar descargas institucionales." />
      ) : null}
      {files && files.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th className="hidden sm:table-cell">Clasificación</th>
                  <th className="hidden md:table-cell">Trabajador</th>
                  <th>Tamaño</th>
                  <th className="hidden lg:table-cell">Resguardado</th>
                  <th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-muted">
                    <td>
                      <p className="max-w-xs truncate font-medium text-slate-800" title={file.name}>{file.name}</p>
                      <p className="text-xs text-slate-500">Job {file.job_id?.slice(0, 8)}</p>
                    </td>
                    <td className="hidden text-sm text-slate-600 sm:table-cell">
                      {file.area_name || '—'}
                      <br />
                      <span className="text-xs text-slate-500">{file.position_name || ''}</span>
                    </td>
                    <td className="hidden text-sm text-slate-600 md:table-cell">{file.owner_name || '—'}</td>
                    <td className="whitespace-nowrap text-sm text-slate-600">{formatBytes(file.size_bytes)}</td>
                    <td className="hidden whitespace-nowrap text-sm text-slate-500 lg:table-cell">{formatDate(file.created_at)}</td>
                    <td className="text-right">
                      <a href={`/api/v1/files/${file.id}/content`} className="btn-secondary px-3 py-1.5" download aria-label={`Descargar ${file.name}`}>
                        <Download className="h-4 w-4" /> Descargar
                      </a>
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
