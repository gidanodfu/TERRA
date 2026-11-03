import { useEffect, useState } from 'react'
import { Download, FolderOpen } from 'lucide-react'
import { api, queryString } from '../../services/api'
import { Alert, EmptyState, LoadingBlock, PageHeader, Pagination } from '../../components/ui'
import { formatBytes, formatDate } from '../../utils/format'

export default function WorkerDocuments() {
  const [files, setFiles] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const pageSize = 25

  useEffect(() => {
    let active = true
    setFiles(null)
    api
      .get(`/me/stored-files${queryString({ page, page_size: pageSize })}`)
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
        title="Mis documentos"
        description="Documentos resguardados por TERRA a partir de su cuenta de Google Drive. Solo usted y el personal autorizado pueden consultarlos."
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!files && !error ? <LoadingBlock /> : null}
      {files && files.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Aún no hay documentos resguardados"
          description="Los archivos aparecerán después de que un administrador complete una descarga institucional de su Drive."
        />
      ) : null}
      {files && files.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th className="hidden sm:table-cell">Origen</th>
                  <th>Tamaño</th>
                  <th className="hidden md:table-cell">Resguardado</th>
                  <th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50">
                    <td>
                      <p className="max-w-xs truncate font-medium text-slate-800" title={file.name}>
                        {file.name}
                      </p>
                      {file.export_mime_type ? (
                        <p className="text-xs text-slate-500">Convertido desde Google Workspace</p>
                      ) : null}
                    </td>
                    <td className="hidden text-xs text-slate-500 sm:table-cell">
                      {file.area_name || '—'}
                      <br />
                      {file.position_name || ''}
                    </td>
                    <td className="whitespace-nowrap text-sm text-slate-600">{formatBytes(file.size_bytes)}</td>
                    <td className="hidden whitespace-nowrap text-sm text-slate-500 md:table-cell">
                      {formatDate(file.created_at)}
                    </td>
                    <td className="text-right">
                      <a
                        href={`/api/v1/files/${file.id}/content`}
                        className="btn-secondary px-3 py-1.5"
                        download
                        aria-label={`Descargar ${file.name}`}
                      >
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
