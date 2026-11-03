import { useEffect, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Loader2, X } from 'lucide-react'
import { api } from '../../services/api'
import { Alert, Button, Spinner } from '../../components/ui'

export default function FolderPicker({ userId, selected, onChange, disabled = false }) {
  const [stack, setStack] = useState([{ id: 'root', name: 'Mi unidad' }])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setStack([{ id: 'root', name: 'Mi unidad' }])
    setData(null)
    setError('')
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined
    let active = true
    setLoading(true)
    setError('')
    const parent = stack[stack.length - 1]
    api
      .get(`/admin/users/${userId}/drive/folders?parentId=${encodeURIComponent(parent.id)}`)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [userId, stack])

  const current = stack[stack.length - 1]
  const isRoot = current.id === 'root' || data?.is_root
  const isSelected = selected.some((folder) => folder.id === current.id)

  const open = (folder) => {
    setStack((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  const goTo = (index) => {
    setStack((prev) => prev.slice(0, index + 1))
  }

  const toggle = (folder) => {
    if (selected.some((item) => item.id === folder.id)) {
      onChange(selected.filter((item) => item.id !== folder.id))
    } else {
      onChange([...selected, { id: folder.id, name: folder.name, path: [...stack.slice(1).map((s) => s.name), folder.name].join(' / ') }])
    }
  }

  const selectCurrent = () => {
    if (isRoot) return
    const path = stack.slice(1).map((s) => s.name).join(' / ')
    onChange([...selected, { id: current.id, name: current.name, path }])
  }

  if (!userId) {
    return <p className="text-sm text-slate-500">Seleccione primero un trabajador.</p>
  }

  return (
    <div>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-1 text-sm">
        {stack.map((item, index) => (
          <span key={item.id} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-4 w-4 text-slate-300" /> : null}
            <button
              type="button"
              onClick={() => goTo(index)}
              className={`rounded px-1.5 py-0.5 ${index === stack.length - 1 ? 'font-medium text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {item.name}
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

      <div className="mt-3 min-h-40 rounded-xl border border-slate-200">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando Google Drive…
          </div>
        ) : data?.folders?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.folders.map((folder) => {
              const checked = selected.some((item) => item.id === folder.id)
              return (
                <li key={folder.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => open(folder)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-slate-700 hover:text-brand-800"
                    title={folder.name}
                  >
                    {folder.name}
                  </button>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-700"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(folder)}
                    />
                    Seleccionar
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            {loading ? '' : 'Esta carpeta no contiene subcarpetas.'}
          </p>
        )}
      </div>

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
                  onClick={() => onChange(selected.filter((item) => item.id !== folder.id))}
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
          <Spinner className="h-3 w-3" /> No hay carpetas seleccionadas.
        </p>
      )}
    </div>
  )
}
