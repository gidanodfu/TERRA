import { useEffect, useState } from 'react'
import {
  Archive,
  ChevronRight,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Image,
  Link2,
  Loader2,
  Presentation,
  Video,
  X,
} from 'lucide-react'
import { api, queryString } from '../../services/api'
import { Alert, Button, Spinner } from '../../components/ui'
import { formatBytes, formatDate } from '../../utils/format'

function itemIcon(item) {
  if (item.is_shortcut) return Link2
  if (item.kind === 'folder') return Folder
  const mime = item.mime_type || ''
  if (mime === 'application/pdf') return FileText
  if (mime === 'application/vnd.google-apps.document' || mime.includes('wordprocessingml') || mime === 'application/msword') return FileText
  if (mime === 'application/vnd.google-apps.spreadsheet' || mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || mime === 'text/csv') return FileSpreadsheet
  if (mime === 'application/vnd.google-apps.presentation' || mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return Presentation
  if (mime.startsWith('image/')) return Image
  if (mime.startsWith('video/')) return Video
  if (/zip|rar|7z|gzip|tar/.test(mime)) return Archive
  return File
}

function typeLabel(item) {
  if (item.is_shortcut) return 'Atajo'
  if (item.kind === 'folder') return 'Carpeta'
  const mime = item.mime_type || ''
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'application/vnd.google-apps.document' || mime.includes('wordprocessingml') || mime === 'application/msword') return 'Documento'
  if (mime === 'application/vnd.google-apps.spreadsheet' || mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || mime === 'text/csv') return 'Hoja de cálculo'
  if (mime === 'application/vnd.google-apps.presentation' || mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return 'Presentación'
  if (mime.startsWith('image/')) return 'Imagen'
  if (mime.startsWith('video/')) return 'Vídeo'
  if (/zip|rar|7z|gzip|tar/.test(mime)) return 'Archivo comprimido'
  return 'Archivo'
}

export default function FolderPicker({ userId, selected, onChange, disabled = false }) {
  const [stack, setStack] = useState([{ id: 'root', name: 'Mi unidad' }])
  const [items, setItems] = useState([])
  const [nextToken, setNextToken] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setStack([{ id: 'root', name: 'Mi unidad' }])
    setItems([])
    setNextToken('')
    setData(null)
    setError('')
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    const parent = stack[stack.length - 1]
    setLoading(true)
    setError('')
    setData(null)
    setItems([])
    setNextToken('')
    api
      .get(`/admin/users/${userId}/drive/items${queryString({ parentId: parent.id, page_size: 100 })}`)
      .then((result) => {
        if (!active) return
        setData(result)
        setItems(result.items || [])
        setNextToken(result.next_page_token || '')
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [userId, stack])

  const current = stack[stack.length - 1]
  const isRoot = current.id === 'root' || Boolean(data?.is_root)
  const isSelected = selected.some((folder) => folder.id === current.id)

  const open = (item) => {
    if (item.kind !== 'folder' || item.is_shortcut) return
    setStack((prev) => [...prev, { id: item.id, name: item.name }])
  }

  const goTo = (index) => {
    setStack((prev) => prev.slice(0, index + 1))
  }

  const toggle = (item) => {
    if (item.kind !== 'folder' || item.is_shortcut) return
    if (selected.some((entry) => entry.id === item.id)) {
      onChange(selected.filter((entry) => entry.id !== item.id))
      return
    }
    onChange([...selected, {
      id: item.id,
      name: item.name,
      path: [...stack.slice(1).map((crumb) => crumb.name), item.name].join(' / '),
    }])
  }

  const selectCurrent = () => {
    if (isRoot || isSelected) return
    onChange([...selected, {
      id: current.id,
      name: current.name,
      path: stack.slice(1).map((crumb) => crumb.name).join(' / '),
    }])
  }

  const loadMore = async () => {
    if (!nextToken || loadingMore) return
    const parent = stack[stack.length - 1]
    setLoadingMore(true)
    setError('')
    try {
      const result = await api.get(`/admin/users/${userId}/drive/items${queryString({
        parentId: parent.id,
        page_size: 100,
        page_token: nextToken,
      })}`)
      setData(result)
      setItems((prev) => [...prev, ...(result.items || [])])
      setNextToken(result.next_page_token || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  if (!userId) {
    return <p className="text-sm text-slate-500">Seleccione primero un trabajador.</p>
  }

  return (
    <div>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-1 text-sm">
        {stack.map((crumb, index) => (
          <span key={crumb.id} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-4 w-4 text-slate-300" /> : null}
            <button
              type="button"
              onClick={() => goTo(index)}
              aria-label={index === stack.length - 1 ? `Carpeta actual ${crumb.name}` : `Volver a ${crumb.name}`}
              className={`rounded px-1.5 py-0.5 ${index === stack.length - 1 ? 'font-medium text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!isRoot ? (
          <Button type="button" variant="secondary" onClick={selectCurrent} disabled={disabled || isSelected}>
            <FolderOpen className="h-4 w-4" /> {isSelected ? 'Carpeta ya seleccionada' : 'Seleccionar esta carpeta'}
          </Button>
        ) : (
          <p className="text-xs text-slate-500">Para respaldar todo Mi unidad use la modalidad correspondiente.</p>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando Google Drive…
          </div>
        ) : items.length ? (
          <div className="table-wrap">
            <table className="table table-fixed">
              <thead>
                <tr>
                  <th className="w-[40%]">Elemento</th>
                  <th className="hidden w-[20%] sm:table-cell">Tipo</th>
                  <th className="w-[12%]">Tamaño</th>
                  <th className="hidden w-[20%] md:table-cell">Fechas</th>
                  <th className="w-[8%] text-right">Sel.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const Icon = itemIcon(item)
                  const isFolder = item.kind === 'folder' && !item.is_shortcut
                  const checked = selected.some((entry) => entry.id === item.id)
                  const unavailable = item.kind === 'file' && !item.is_shortcut && !item.can_download
                  return (
                    <tr key={item.id} className="hover:bg-muted">
                      <td>
                        <div className="flex min-w-0 items-center gap-2">
                          <Icon className={`h-4 w-4 shrink-0 ${isFolder ? 'text-brand-700' : 'text-slate-400'}`} aria-hidden="true" />
                          {isFolder ? (
                            <button
                              type="button"
                              onClick={() => open(item)}
                              className="min-w-0 truncate text-left text-sm font-medium text-slate-800 hover:text-brand-800"
                              title={item.name}
                            >
                              {item.name}
                            </button>
                          ) : (
                            <span className="min-w-0 truncate text-sm text-slate-700" title={item.name}>{item.name}</span>
                          )}
                          {item.web_view_link ? (
                            <a
                              href={item.web_view_link}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-slate-400 hover:text-brand-700"
                              aria-label={`Abrir ${item.name} en Google Drive`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                          {item.is_shortcut ? <span>Atajo de referencia</span> : null}
                          {item.starred ? <span>· Destacado</span> : null}
                          {item.shared ? <span>· Compartido</span> : null}
                          {unavailable ? <span>· No descargable</span> : null}
                          {item.description ? <span className="truncate">· {item.description}</span> : null}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <p className="text-sm text-slate-700">{typeLabel(item)}</p>
                        <p className="max-w-48 truncate text-[11px] text-slate-400" title={item.mime_type}>{item.mime_type}</p>
                      </td>
                      <td className="whitespace-nowrap text-sm text-slate-600">
                        {item.size_bytes != null ? formatBytes(item.size_bytes) : 'No informado'}
                      </td>
                      <td className="hidden whitespace-nowrap text-xs text-slate-500 md:table-cell">
                        <p>Modificado: {formatDate(item.modified_time)}</p>
                        <p>Creado: {formatDate(item.created_time)}</p>
                      </td>
                      <td className="text-right">
                        {isFolder ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-700 accent-brand-700"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggle(item)}
                            aria-label={`Seleccionar carpeta ${item.name}`}
                          />
                        ) : (
                          <span className="text-xs text-slate-400" title={item.is_shortcut ? 'Atajo no seleccionable' : 'Los archivos no se seleccionan como raíz'}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            {error ? 'No se pudo mostrar el contenido de esta carpeta.' : 'Esta carpeta no contiene archivos ni subcarpetas.'}
          </p>
        )}
      </div>

      {nextToken ? (
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner className="h-4 w-4" /> : null}
            {loadingMore ? 'Cargando más…' : 'Cargar más elementos'}
          </Button>
        </div>
      ) : null}

      {selected.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500">Carpetas seleccionadas ({selected.length})</p>
          <ul className="mt-2 space-y-1.5">
            {selected.map((folder) => (
              <li key={folder.id} className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-brand-900">
                  Mi unidad / {folder.path || folder.name}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((entry) => entry.id !== folder.id))}
                  className="rounded p-1 text-brand-700 hover:bg-brand-100"
                  aria-label={`Quitar ${folder.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Si selecciona una carpeta padre y una descendiente, el servidor conservará solo la raíz padre.
          </p>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <FolderOpen className="h-3 w-3" /> No hay carpetas seleccionadas.
        </p>
      )}
    </div>
  )
}
