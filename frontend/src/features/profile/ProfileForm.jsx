import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../app/AuthContext'
import { Alert, Button, Field, Input, Select, Spinner } from '../../components/ui'

export default function ProfileForm({ user, onSaved, submitLabel = 'Guardar perfil', allowCancel = false, onCancel, variant = 'default' }) {
  const workspace = variant === 'workspace'
  const { refresh } = useAuth()
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    area_id: user?.area_id || '',
    position_id: user?.position_id || '',
  })
  const [areas, setAreas] = useState([])
  const [positions, setPositions] = useState([])
  const [loadingAreas, setLoadingAreas] = useState(true)
  const [loadingPositions, setLoadingPositions] = useState(false)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoadingAreas(true)
    api
      .get('/public/areas')
      .then((data) => active && setAreas(data.data || []))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoadingAreas(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!form.area_id) {
      setPositions([])
      return undefined
    }
    let active = true
    setLoadingPositions(true)
    api
      .get(`/public/areas/${form.area_id}/positions`)
      .then((data) => {
        if (!active) return
        setPositions(data.data || [])
        setForm((current) => {
          if (current.position_id && (data.data || []).some((p) => p.id === current.position_id)) return current
          return { ...current, position_id: '' }
        })
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoadingPositions(false))
    return () => {
      active = false
    }
  }, [form.area_id])

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    const clientErrors = {}
    if (!form.first_name.trim()) clientErrors.first_name = 'Ingrese sus nombres.'
    if (!form.last_name.trim()) clientErrors.last_name = 'Ingrese sus apellidos.'
    if (!form.area_id) clientErrors.area_id = 'Seleccione un área.'
    if (!form.position_id) clientErrors.position_id = 'Seleccione un cargo.'
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }
    setSaving(true)
    try {
      const updated = await api.patch('/me/profile', form)
      setSuccess('Perfil actualizado correctamente.')
      await refresh()
      onSaved?.(updated)
    } catch (err) {
      setError(err.message)
      if (err.fields) setErrors(err.fields)
    } finally {
      setSaving(false)
    }
  }

  const personalFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombres" htmlFor="first_name" error={errors.first_name}>
        <Input
          id="first_name"
          value={form.first_name}
          onChange={(e) => update('first_name', e.target.value)}
          error={errors.first_name}
          autoComplete="given-name"
          maxLength={100}
        />
      </Field>
      <Field label="Apellidos" htmlFor="last_name" error={errors.last_name}>
        <Input
          id="last_name"
          value={form.last_name}
          onChange={(e) => update('last_name', e.target.value)}
          error={errors.last_name}
          autoComplete="family-name"
          maxLength={100}
        />
      </Field>
    </div>
  )

  const organizationFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Área" htmlFor="area_id" error={errors.area_id} hint={loadingAreas ? 'Cargando áreas…' : undefined}>
        <Select
          id="area_id"
          value={form.area_id}
          onValueChange={(value) => update('area_id', value)}
          error={errors.area_id}
          disabled={loadingAreas}
        >
          <option value="">Seleccione un área</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Cargo"
        htmlFor="position_id"
        error={errors.position_id}
        hint={!form.area_id ? 'Seleccione primero un área.' : loadingPositions ? 'Cargando cargos…' : undefined}
      >
        <Select
          id="position_id"
          value={form.position_id}
          onValueChange={(value) => update('position_id', value)}
          error={errors.position_id}
          disabled={!form.area_id || loadingPositions}
        >
          <option value="">Seleccione un cargo</option>
          {positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )

  return (
    <form onSubmit={submit} noValidate className={workspace ? 'space-y-7' : 'space-y-4'}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      {workspace ? (
        <section data-testid="profile-personal-section" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Datos personales</h2>
            <p className="mt-1 text-xs text-slate-500">Nombre y apellidos que aparecerán en los registros institucionales.</p>
          </div>
          {personalFields}
        </section>
      ) : personalFields}

      {workspace ? (
        <section data-testid="profile-organization-section" className="space-y-4">
          <div className="border-t border-slate-200 pt-6">
            <h2 className="text-sm font-semibold text-slate-900">Asignación organizativa</h2>
            <p className="mt-1 text-xs text-slate-500">El cargo disponible depende del área seleccionada.</p>
          </div>
          {organizationFields}
        </section>
      ) : organizationFields}

      <div className={workspace ? 'flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end' : 'flex items-center gap-2'}>
        <Button type="submit" disabled={saving} className={workspace ? 'w-full sm:w-auto' : ''}>
          {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? 'Guardando…' : submitLabel}
        </Button>
        {allowCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} className={workspace ? 'w-full sm:w-auto' : ''}>
            Cancelar
          </Button>
        ) : null}
      </div>
      {loadingAreas ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Spinner className="h-3.5 w-3.5" /> Cargando catálogo organizativo…
        </p>
      ) : null}
    </form>
  )
}
