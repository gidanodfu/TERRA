import { useCallback, useEffect, useState } from 'react'
import { Search, ShieldCheck, UserPlus } from 'lucide-react'
import { api, queryString } from '../../services/api'
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Pagination,
  Select,
  Spinner,
} from '../../components/ui'
import { useAuth } from '../../app/AuthContext'
import { StatusBadge } from '../../features/downloads/StatusBadge'
import { PERMISSIONS, ADMIN_ROLE_LABELS, ADMIN_ROLE_OPTIONS } from '../../features/auth/permissions'
import { formatDate } from '../../utils/format'

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/
const EMPTY_FORM = {
  role: 'moderator',
  first_name: '',
  last_name: '',
  username: '',
  password: '',
  password_confirmation: '',
}

export default function AdministrativeAccountsPanel({ createOpen, onCloseCreate }) {
  const { user, can } = useAuth()
  const [accounts, setAccounts] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [status, setStatus] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const pageSize = 20
  const canWrite = can(PERMISSIONS.ACCOUNTS_WRITE)

  const load = useCallback(async () => {
    setAccounts(null)
    try {
      const data = await api.get(`/admin/accounts${queryString({
        page, page_size: pageSize, q: applied, status, role,
      })}`)
      setAccounts(data.data || [])
      setTotal(data.pagination?.total || 0)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [page, applied, status, role])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!createOpen) {
      setForm(EMPTY_FORM)
      setFieldErrors({})
      setFormError('')
    }
  }, [createOpen])

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
  }

  const validate = () => {
    const errors = {}
    if (!form.role) errors.role = 'Seleccione un rol.'
    if (!form.first_name.trim()) errors.first_name = 'Ingrese los nombres.'
    if (!form.last_name.trim()) errors.last_name = 'Ingrese los apellidos.'
    if (form.first_name.trim().length > 100) errors.first_name = 'Máximo 100 caracteres.'
    if (form.last_name.trim().length > 100) errors.last_name = 'Máximo 100 caracteres.'
    if (!form.username.trim()) errors.username = 'Ingrese un nombre de usuario.'
    else if (!USERNAME_PATTERN.test(form.username.trim().toLowerCase())) {
      errors.username = 'Use de 3 a 64 caracteres: minúsculas, números, punto, guion o guion bajo.'
    }
    if (!form.password) errors.password = 'Ingrese una contraseña.'
    else if (form.password.length < 12) errors.password = 'Debe tener al menos 12 caracteres.'
    if (!form.password_confirmation) errors.password_confirmation = 'Confirme la contraseña.'
    else if (form.password !== form.password_confirmation) {
      errors.password_confirmation = 'Las contraseñas no coinciden.'
    }
    return errors
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setFormError('')
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setSaving(true)
    try {
      const created = await api.post('/admin/accounts', {
        role: form.role,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        password_confirmation: form.password_confirmation,
      })
      setError('')
      setSuccess(`Cuenta creada: ${created.username} · ${ADMIN_ROLE_LABELS[created.role] || created.role}. Deberá cambiar la contraseña en su primer acceso.`)
      setForm(EMPTY_FORM)
      onCloseCreate()
      setPage(1)
      await load()
    } catch (err) {
      setFormError(err.message)
      if (err.fields) setFieldErrors(err.fields)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (account) => {
    const next = account.status === 'active' ? 'disabled' : 'active'
    if (next === 'disabled' && !window.confirm(
      `¿Desactivar la cuenta de ${account.display_name} (${account.username})? Se invalidarán sus sesiones.`,
    )) return
    setBusyId(account.id)
    setError('')
    try {
      await api.patch(`/admin/accounts/${account.id}`, { status: next })
      setError('')
      setSuccess(next === 'disabled' ? 'Cuenta administrativa desactivada.' : 'Cuenta administrativa reactivada.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  const selectedRole = ADMIN_ROLE_OPTIONS.find((option) => option.value === form.role)

  return (
    <div>
      {error ? <Alert tone="error" onClose={() => setError('')}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess('')}>{success}</Alert> : null}

      <div className="mb-4 flex flex-col gap-2 @2xl:flex-row">
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
            placeholder="Buscar por nombre o usuario"
            aria-label="Buscar cuentas administrativas"
          />
          <Button type="submit" variant="secondary"><Search className="h-4 w-4" /> Buscar</Button>
        </form>
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} aria-label="Filtrar por rol" className="@2xl:w-48">
          <option value="">Todos los roles</option>
          {ADMIN_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} aria-label="Filtrar por estado" className="@2xl:w-48">
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="disabled">Desactivados</option>
        </Select>
      </div>

      {!accounts && !error ? <LoadingBlock /> : null}
      {accounts && accounts.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No hay cuentas administrativas con este filtro" description="Cree la primera cuenta con el botón «Nuevo usuario administrativo»." />
      ) : null}
      {accounts && accounts.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre completo</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th className="hidden md:table-cell">Creada</th>
                  <th className="hidden lg:table-cell">Último acceso</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => {
                  const isSelf = account.id === user?.id
                  const protectedAccount = account.is_principal
                  return (
                    <tr key={account.id} className="hover:bg-muted">
                      <td>
                        <p className="font-medium text-slate-800">{account.display_name}</p>
                        {protectedAccount ? (
                          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                            <ShieldCheck className="h-3 w-3" /> Administrador principal protegido
                          </p>
                        ) : null}
                      </td>
                      <td className="text-sm text-slate-600">{account.username}</td>
                      <td className="text-sm text-slate-600">{ADMIN_ROLE_LABELS[account.role] || account.role}</td>
                      <td><StatusBadge type="user" status={account.status} /></td>
                      <td className="hidden whitespace-nowrap text-sm text-slate-500 md:table-cell">{formatDate(account.created_at)}</td>
                      <td className="hidden whitespace-nowrap text-sm text-slate-500 lg:table-cell">{formatDate(account.last_login_at)}</td>
                      <td className="text-right">
                        {canWrite && !protectedAccount && !isSelf ? (
                          <Button
                            variant={account.status === 'active' ? 'danger' : 'secondary'}
                            className="px-3 py-1.5"
                            onClick={() => toggle(account)}
                            disabled={busyId === account.id}
                          >
                            {busyId === account.id ? <Spinner className="h-4 w-4" /> : null}
                            {account.status === 'active' ? 'Desactivar' : 'Activar'}
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {protectedAccount ? 'Protegido' : isSelf ? 'Cuenta actual' : 'Sin acciones'}
                          </span>
                        )}
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

      <Modal
        open={createOpen}
        title="Nuevo usuario administrativo"
        onClose={onCloseCreate}
        footer={
          <>
            <Button variant="secondary" onClick={onCloseCreate} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="create-administrative-account" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              Crear cuenta
            </Button>
          </>
        }
      >
        <form id="create-administrative-account" onSubmit={submit} className="space-y-4" noValidate>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <Field label="Rol administrativo" htmlFor="account-role" error={fieldErrors.role}>
            <Select id="account-role" value={form.role} onChange={(e) => update('role', e.target.value)} error={fieldErrors.role}>
              {ADMIN_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          {selectedRole ? (
            <Alert tone="info" title={`Permisos de ${selectedRole.label}`}>
              {selectedRole.description}
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombres" htmlFor="account-first-name" error={fieldErrors.first_name}>
              <Input id="account-first-name" value={form.first_name} onChange={(e) => update('first_name', e.target.value)}
                error={fieldErrors.first_name} maxLength={100} autoComplete="given-name" />
            </Field>
            <Field label="Apellidos" htmlFor="account-last-name" error={fieldErrors.last_name}>
              <Input id="account-last-name" value={form.last_name} onChange={(e) => update('last_name', e.target.value)}
                error={fieldErrors.last_name} maxLength={100} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Usuario" htmlFor="account-username" error={fieldErrors.username}
            hint="Minúsculas, números, punto, guion o guion bajo. Se guarda normalizado.">
            <Input id="account-username" value={form.username}
              onChange={(e) => update('username', e.target.value.toLowerCase())}
              error={fieldErrors.username} maxLength={64} autoComplete="username" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contraseña" htmlFor="account-password" error={fieldErrors.password}
              hint="Mínimo 12 caracteres. No se recorta ni se registra.">
              <Input id="account-password" type="password" value={form.password}
                onChange={(e) => update('password', e.target.value)}
                error={fieldErrors.password} autoComplete="new-password" />
            </Field>
            <Field label="Confirmar contraseña" htmlFor="account-password-confirmation" error={fieldErrors.password_confirmation}>
              <Input id="account-password-confirmation" type="password" value={form.password_confirmation}
                onChange={(e) => update('password_confirmation', e.target.value)}
                error={fieldErrors.password_confirmation} autoComplete="new-password" />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  )
}
