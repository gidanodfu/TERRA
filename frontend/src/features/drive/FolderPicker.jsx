import { useEffect, useState } from 'react'
import { ChevronRight, ExternalLink, Folder, Loader2, X } from 'lucide-react'
import { api, queryString } from '../../services/api'
import { Alert, Button, Spinner } from '../../components/ui'
import { formatBytes, formatDate } from '../../utils/format'
import FileTypeIcon from './FileTypeIcon'
import { fileHasCheckbox, fileTypeLabel } from './fileTypes'

const EMPTY_SELECTION = { folders: [], files: [] }

function normalizeSelection(selected) {
  if (!selected) return EMPTY_SELECTION
  if (Array.isArray(selected)) return { folders: selected, files: [] }
  return {
    folders: Array.isArray(selected.folders) ? selected.folders : [],
    files: Array.isArray(selected.files) ? selected.files : [],
  }
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

  const selection = normalizeSelection(selected)
  const { folders, files } = selection
  const current = stack[stack.length - 1]
  const isRoot = current.id === 'root' || Boolean(data?.is_root)
  const currentPath = stack.slice(1).map((crumb) => crumb.name).join(' / ')
  const isCurrentSelected = folders.some((folder) => folder.id === current.id)

  const emit = (nextFolders, nextFiles) => onChange({ folders: nextFolders, files: nextFiles })

  const open = (item) => {
    if (item.kind !== 'folder' || item.is_shortcut) return
    setStack((prev) => [...prev, { id: item.id, name: item.name }])
  }

  const goTo = (index) => {
    setStack((prev) => prev.slice(0, index + 1))
  }

  const addFolder = (id, name, path) => {
    const covered = (entry) => entry.path === path || entry.path.startsWith(`${path} / `)
    emit(
      [
        ...folders.filter((folder) => folder.id !== id && !covered(folder)),
        { id, name, path },
      ],
      files.filter((file) => !covered(file)),
    )
  }

  const removeFolder = (id) => emit(folders.filter((folder) => folder.id !== id), files)

  const toggleFolder = (item) => {
    if (item.kind !== 'folder' || item.is_shortcut) return
    if (folders.some((folder) => folder.id === item.id)) {
      removeFolder(item.id)
      return
    }
    addFolder(item.id, item.name, [...stack.slice(1).map((crumb) => crumb.name), item.name].join(' / '))
  }

  const selectCurrent = () => {
    if (isRoot || isCurrentSelected) return
    addFolder(current.id, current.name, currentPath)
  }

  const toggleFile = (item) => {
    if (!fileHasCheckbox(item)) return
    if (files.some((file) => file.id === item.id)) {
      emit(folders, files.filter((file) => file.id !== item.id))
      return
    }
    const path = [...stack.slice(1).map((crumb) => crumb.name), item.name].join(' / ')
    const covered = folders.some((folder) => path === folder.path || path.startsWith(`${folder.path} / `))
    if (covered) return
    emit(folders, [...files, { id: item.id, name: item.name, path, mime_type: item.mime_type, kind: item.kind }])
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
    <div className="@container w-full min-w-0 max-w-full">
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
          <Button type="button" variant="secondary" onClick={selectCurrent} disabled={disabled || isCurrentSelected}>
            <Folder className="h-4 w-4" /> {isCurrentSelected ? 'Carpeta ya seleccionada' : 'Seleccionar esta carpeta'}
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
          <div className="table-wrap w-full min-w-0">
            <table className="table table-fixed w-full">
              <thead>
                <tr>
                  <th className="w-[86%] @xl:w-[48%] @3xl:w-[38%] @6xl:w-[40%]">Elemento</th>
                  <th className="hidden w-[22%] @xl:table-cell @3xl:w-[17%] @6xl:w-[18%]">Tipo</th>
                  <th className="hidden w-[18%] @xl:table-cell @3xl:w-[11%]">Tamaño</th>
                  <th className="hidden @3xl:table-cell @3xl:w-[27%] @6xl:w-[24%]">Fechas</th>
                  <th className="w-[14%] px-2 text-right @xl:w-[12%] @3xl:w-[7%]">Sel.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isFolder = item.kind === 'folder' && !item.is_shortcut
                  const selectable = isFolder || fileHasCheckbox(item)
                  const checked = isFolder
                    ? folders.some((folder) => folder.id === item.id)
                    : files.some((file) => file.id === item.id)
                  const unavailable = !isFolder && !item.is_shortcut && !fileHasCheckbox(item)
                  return (
                    <tr key={item.id} className="hover:bg-muted">
                      <td>
                        <div className="flex min-w-0 items-center gap-2">
                          <FileTypeIcon
                            item={item}
                            className={`h-4 w-4 shrink-0 ${isFolder ? 'text-brand-700' : 'text-slate-400'}`}
                          />
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
                          {item.mime_type === 'application/vnd.google-apps.vid' ? <span>· Formato no soportado</span> : null}
                          {unavailable ? <span>· No descargable</span> : null}
                          {item.description ? <span className="truncate">· {item.description}</span> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-slate-500 @xl:hidden">
                          <span className="font-medium text-slate-600">{fileTypeLabel(item)}</span>
                          <span>{item.size_bytes != null ? formatBytes(item.size_bytes) : 'No informado'}</span>
                          {item.mime_type ? (
                            <span className="min-w-0 truncate" title={item.mime_type}>{item.mime_type}</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500 @3xl:hidden">
                          <span title={formatDate(item.modified_time)}>Modificado: {formatDate(item.modified_time)}</span>
                          <span title={formatDate(item.created_time)}>Creado: {formatDate(item.created_time)}</span>
                        </div>
                      </td>
                      <td className="hidden @xl:table-cell">
                        <p className="text-sm text-slate-700">{fileTypeLabel(item)}</p>
                        {item.mime_type ? (
                          <p className="min-w-0 truncate text-[11px] text-slate-400" title={item.mime_type}>{item.mime_type}</p>
                        ) : null}
                      </td>
                      <td className="hidden whitespace-nowrap text-sm text-slate-600 @xl:table-cell">
                        {item.size_bytes != null ? formatBytes(item.size_bytes) : 'No informado'}
                      </td>
                      <td className="hidden text-xs leading-5 text-slate-500 @3xl:table-cell">
                        <p title={formatDate(item.modified_time)}>Modificado: {formatDate(item.modified_time)}</p>
                        <p title={formatDate(item.created_time)}>Creado: {formatDate(item.created_time)}</p>
                      </td>
                      <td className="px-2 text-right">
                        {selectable ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-brand-700 accent-brand-700"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => (isFolder ? toggleFolder(item) : toggleFile(item))}
                            aria-label={`${isFolder ? 'Seleccionar carpeta' : 'Seleccionar archivo'} ${item.name}`}
                          />
                        ) : (
                          <span
                            className="text-xs text-slate-400"
                            title={item.is_shortcut ? 'Atajo no seleccionable' : 'Elemento sin estrategia de descarga'}
                          >
                            —
                          </span>
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

      {folders.length || files.length ? (
        <div className="mt-3 space-y-3">
          {folders.length ? (
            <section>
              <p className="text-xs font-medium text-slate-500">Carpetas seleccionadas ({folders.length})</p>
              <ul className="mt-2 space-y-1.5">
                {folders.map((folder) => (
                  <li key={folder.id} className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-brand-900">
                      <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate" title={folder.path || folder.name}>Mi unidad / {folder.path || folder.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFolder(folder.id)}
                      className="rounded p-1 text-brand-700 hover:bg-brand-100"
                      aria-label={`Quitar ${folder.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {files.length ? (
            <section>
              <p className="text-xs font-medium text-slate-500">Archivos seleccionados ({files.length})</p>
              <ul className="mt-2 space-y-1.5">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-slate-800">
                      <FileTypeIcon item={file} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate" title={file.name}>{file.name}</span>
                        <span className="block truncate text-[11px] text-slate-500" title={file.path}>
                          {fileTypeLabel(file)} · Mi unidad / {file.path}
                        </span>
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => emit(folders, files.filter((entry) => entry.id !== file.id))}
                      className="rounded p-1 text-slate-600 hover:bg-slate-200"
                      aria-label={`Quitar ${file.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="text-xs text-slate-500">
            El servidor conserva solo la carpeta padre cuando una selección está cubierta por otra.
          </p>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Folder className="h-3 w-3" /> No hay carpetas ni archivos seleccionados.
        </p>
      )}
    </div>
  )
}
