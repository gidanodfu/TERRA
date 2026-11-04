import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Users } from 'lucide-react'
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
import { StatusBadge } from '../../features/downloads/StatusBadge'
import { formatDate } from '../../utils/format'

export default function AdminWorkers() {
  const [users, setUsers] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const pageSize = 20

  useEffect(() => {
    let active = true
    setUsers(null)
    api
      .get(`/admin/users${queryString({ page, page_size: pageSize, q: applied, status })}`)
      .then((data) => {
        if (!active) return
        setUsers(data.data || [])
        setTotal(data.pagination?.total || 0)
        setError('')
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [page, applied, status])

  return (
    <div>
      <PageHeader
        title="Trabajadores"
        description="Los perfiles se crean al iniciar sesión con Google. Aquí puede revisar su estado, asignación y conexión de Drive."
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
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar trabajadores"
          />
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" /> Buscar
          </Button>
        </form>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filtrar por estado" className="@lg:w-56">
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="pending_profile">Perfil pendiente</option>
          <option value="suspended">Suspendidos</option>
          <option value="disabled">Desactivados</option>
        </Select>
      </div>

      {!users && !error ? <LoadingBlock /> : null}
      {users && users.length === 0 ? (
        <EmptyState icon={Users} title="No hay trabajadores con este filtro" description="Ajuste la búsqueda o espere a que los trabajadores inicien sesión." />
      ) : null}
      {users && users.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Trabajador</th>
                  <th className="hidden sm:table-cell">Área / Cargo</th>
                  <th>Estado</th>
                  <th className="hidden md:table-cell">Último acceso</th>
                  <th className="sr-only">Abrir</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted">
                    <td>
                      <Link to={`/app/admin/workers/${user.id}`} className="font-medium text-brand-800 hover:underline">
                        {user.display_name || `${user.first_name} ${user.last_name}`}
                      </Link>
                      <p className="text-xs text-slate-500">{user.email || 'Sin correo'}</p>
                    </td>
                    <td className="hidden text-sm text-slate-600 sm:table-cell">
                      {user.area_name || '—'}
                      <br />
                      <span className="text-xs text-slate-500">{user.position_name || 'Sin cargo'}</span>
                    </td>
                    <td><StatusBadge type="user" status={user.status} /></td>
                    <td className="hidden whitespace-nowrap text-sm text-slate-500 md:table-cell">{formatDate(user.last_login_at)}</td>
                    <td className="text-right">
                      <Link to={`/app/admin/workers/${user.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        Ver
                      </Link>
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
