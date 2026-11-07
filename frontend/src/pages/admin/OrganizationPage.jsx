import { useCallback, useEffect, useState } from 'react'
import { Building2, Pencil, Plus, X } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../app/AuthContext'
import { PERMISSIONS } from '../../features/auth/permissions'
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui'

const MAX_RESPONSIBILITIES = 20
const MAX_RESPONSIBILITY_LENGTH = 300

function cleanResponsibilities(values) {
  const cleaned = []
  const seen = new Set()
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, ' ')
    if (!value) return { error: 'Las responsabilidades no pueden estar vacías.' }
    if ([...value].length > MAX_RESPONSIBILITY_LENGTH) {
      return { error: `Cada responsabilidad puede tener como máximo ${MAX_RESPONSIBILITY_LENGTH} caracteres.` }
    }
    const key = value.normalize('NFC').toLocaleLowerCase()
    if (seen.has(key)) return { error: 'No repita responsabilidades dentro de la misma lista.' }
    seen.add(key)
    cleaned.push(value)
  }
  if (cleaned.length > MAX_RESPONSIBILITIES) {
    return { error: `Puede registrar como máximo ${MAX_RESPONSIBILITIES} responsabilidades.` }
  }
  return { values: cleaned }
}

function ResponsibilitiesEditor({ idPrefix, values, onChange, disabled }) {
  const update = (index, value) => onChange(values.map((item, i) => (i === index ? value : item)))
  const remove = (index) => onChange(values.filter((_, i) => i !== index))
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div key={`${idPrefix}-${index}`} className="flex items-start gap-2">
          <Input
            value={value}
            onChange={(e) => update(index, e.target.value)}
            maxLength={MAX_RESPONSIBILITY_LENGTH}
            placeholder="Descripción de la responsabilidad"
            aria-label={`Responsabilidad ${index + 1}`}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            disabled={disabled}
            className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-700"
            aria-label={`Quitar responsabilidad ${index + 1}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...values, ''])}
        disabled={disabled || values.length >= MAX_RESPONSIBILITIES}
      >
        <Plus className="h-4 w-4" /> Añadir responsabilidad
      </Button>
    </div>
  )
}

export default function OrganizationPage() {
  const { can } = useAuth()
  const canWrite = can(PERMISSIONS.ORGANIZATION_WRITE)
  const [areas, setAreas] = useState(null)
  const [selectedArea, setSelectedArea] = useState(null)
  const [positions, setPositions] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [areaModal, setAreaModal] = useState(null)
  const [positionModal, setPositionModal] = useState(null)
  const [areaFieldErrors, setAreaFieldErrors] = useState({})
  const [positionFieldErrors, setPositionFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const loadAreas = useCallback(async () => {
    try {
      const data = await api.get('/admin/areas')
      const list = data.data || []
      setAreas(list)
      setSelectedArea((current) => {
        if (current) return list.find((a) => a.id === current.id) || null
        return list[0] || null
      })
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    loadAreas()
  }, [loadAreas])

  useEffect(() => {
    if (!selectedArea) {
      setPositions([])
      return undefined
    }
    let active = true
    setPositions(null)
    api
      .get(`/admin/areas/${selectedArea.id}/positions`)
      .then((data) => active && setPositions(data.data || []))
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [selectedArea])

  const saveArea = async (event) => {
    event.preventDefault()
    setError('')
    setAreaFieldErrors({})
    const responsibilities = cleanResponsibilities(areaModal.responsibilities || [])
    if (responsibilities.error) {
      setAreaFieldErrors({ responsibilities: responsibilities.error })
      return
    }
    setBusy(true)
    try {
      const payload = { name: areaModal.name, responsibilities: responsibilities.values }
      if (areaModal.id) {
        await api.patch(`/admin/areas/${areaModal.id}`, { ...payload, status: areaModal.status })
        setSuccess('Área actualizada.')
      } else {
        await api.post('/admin/areas', payload)
        setSuccess('Área creada.')
      }
      setAreaModal(null)
      await loadAreas()
    } catch (err) {
      if (err.code === 'area_exists') setAreaFieldErrors({ name: err.message })
      else if (err.fields) setAreaFieldErrors(err.fields)
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const savePosition = async (event) => {
    event.preventDefault()
    setError('')
    setPositionFieldErrors({})
    const responsibilities = cleanResponsibilities(positionModal.responsibilities || [])
    if (responsibilities.error) {
      setPositionFieldErrors({ responsibilities: responsibilities.error })
      return
    }
    setBusy(true)
    try {
      const payload = { name: positionModal.name, responsibilities: responsibilities.values }
      if (positionModal.id) {
        await api.patch(`/admin/positions/${positionModal.id}`, { ...payload, status: positionModal.status })
        setSuccess('Cargo actualizado.')
      } else {
        await api.post(`/admin/areas/${selectedArea.id}/positions`, payload)
        setSuccess('Cargo creado.')
      }
      setPositionModal(null)
      setPositions(null)
      const data = await api.get(`/admin/areas/${selectedArea.id}/positions`)
      setPositions(data.data || [])
    } catch (err) {
      if (err.code === 'position_exists') setPositionFieldErrors({ name: err.message })
      else if (err.fields) setPositionFieldErrors(err.fields)
      else setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Áreas y cargos"
        description="Catálogo organizativo institucional. Áreas y cargos tienen nombres únicos y responsabilidades descriptivas; estas nunca otorgan permisos de sistema."
        actions={canWrite ? (
          <Button onClick={() => { setAreaFieldErrors({}); setAreaModal({ name: '', status: 'active', responsibilities: [] }) }}>
            <Plus className="h-4 w-4" /> Nueva área
          </Button>
        ) : null}
      />

      {error ? <Alert tone="error" onClose={() => setError('')}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess('')}>{success}</Alert> : null}

      <div className="grid gap-6 @2xl:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-3 font-semibold text-slate-900">Áreas</h2>
            {!areas ? (
              <LoadingBlock />
            ) : areas.length === 0 ? (
              <EmptyState icon={Building2} title="Sin áreas" description="Cree la primera área municipal para comenzar." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {areas.map((area) => (
                  <li key={area.id} className="flex items-center justify-between gap-3 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedArea(area)}
                      className={`min-w-0 flex-1 rounded-lg px-2 py-1 text-left ${
                        selectedArea?.id === area.id ? 'bg-brand-50' : 'hover:bg-muted'
                      }`}
                    >
                      <p className={`truncate text-sm font-medium ${selectedArea?.id === area.id ? 'text-brand-900' : 'text-slate-800'}`}>
                        {area.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {area.status === 'active' ? 'Activa' : 'Inactiva'} · {area.position_count} cargos · {area.user_count} trabajadores
                      </p>
                      {area.responsibilities?.length ? (
                        <p className="mt-0.5 truncate text-[11px] text-slate-400" title={area.responsibilities.join(' · ')}>
                          {area.responsibilities[0]}{area.responsibilities.length > 1 ? ` +${area.responsibilities.length - 1}` : ''}
                        </p>
                      ) : null}
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => { setAreaFieldErrors({}); setAreaModal({ id: area.id, name: area.name, status: area.status, responsibilities: area.responsibilities || [] }) }}
                        aria-label={`Editar ${area.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Cargos</h2>
                <p className="text-xs text-slate-500">{selectedArea ? selectedArea.name : 'Seleccione un área'}</p>
              </div>
              {canWrite ? (
                <Button
                  variant="secondary"
                  onClick={() => { setPositionFieldErrors({}); setPositionModal({ name: '', status: 'active', responsibilities: [] }) }}
                  disabled={!selectedArea}
                >
                  <Plus className="h-4 w-4" /> Nuevo cargo
                </Button>
              ) : null}
            </div>
            {!positions ? (
              <LoadingBlock />
            ) : positions.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {selectedArea ? 'Esta área todavía no tiene cargos.' : 'Seleccione un área para gestionar sus cargos.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {positions.map((position) => (
                  <li key={position.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{position.name}</p>
                      <p className="text-xs text-slate-500">{position.status === 'active' ? 'Activo' : 'Inactivo'}</p>
                      {position.responsibilities?.length ? (
                        <p className="mt-0.5 truncate text-[11px] text-slate-400" title={position.responsibilities.join(' · ')}>
                          {position.responsibilities[0]}{position.responsibilities.length > 1 ? ` +${position.responsibilities.length - 1}` : ''}
                        </p>
                      ) : null}
                    </div>
                    {canWrite ? (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => { setPositionFieldErrors({}); setPositionModal({ id: position.id, name: position.name, status: position.status, responsibilities: position.responsibilities || [] }) }}
                        aria-label={`Editar ${position.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={Boolean(areaModal)}
        title={areaModal?.id ? 'Editar área' : 'Nueva área'}
        onClose={() => setAreaModal(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAreaModal(null)}>Cancelar</Button>
            <Button onClick={saveArea} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null} Guardar
            </Button>
          </>
        }
      >
        {areaModal ? (
          <form onSubmit={saveArea} className="space-y-4">
            <Field label="Nombre del área" htmlFor="area-name" error={areaFieldErrors.name}>
              <Input
                id="area-name"
                value={areaModal.name}
                onChange={(e) => setAreaModal({ ...areaModal, name: e.target.value })}
                error={areaFieldErrors.name}
                maxLength={120}
                autoFocus
              />
            </Field>
            <Field
              label="Responsabilidades generales"
              error={areaFieldErrors.responsibilities}
              hint="Máximo 20 responsabilidades; cada una hasta 300 caracteres."
            >
              <ResponsibilitiesEditor
                idPrefix="area-responsibility"
                values={areaModal.responsibilities || []}
                onChange={(responsibilities) => setAreaModal({ ...areaModal, responsibilities })}
                disabled={busy}
              />
            </Field>
            {areaModal.id ? (
              <Field label="Estado" htmlFor="area-status" hint="Desactivar un área no elimina su historial ni sus documentos.">
                <Select
                  id="area-status"
                  value={areaModal.status}
                  onChange={(e) => setAreaModal({ ...areaModal, status: e.target.value })}
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </Select>
              </Field>
            ) : null}
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(positionModal)}
        title={positionModal?.id ? 'Editar cargo' : 'Nuevo cargo'}
        onClose={() => setPositionModal(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPositionModal(null)}>Cancelar</Button>
            <Button onClick={savePosition} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null} Guardar
            </Button>
          </>
        }
      >
        {positionModal ? (
          <form onSubmit={savePosition} className="space-y-4">
            <p className="rounded-xl bg-muted p-3 text-sm text-slate-600">Área: {selectedArea?.name}</p>
            <Field label="Nombre del cargo" htmlFor="position-name" error={positionFieldErrors.name}>
              <Input
                id="position-name"
                value={positionModal.name}
                onChange={(e) => setPositionModal({ ...positionModal, name: e.target.value })}
                error={positionFieldErrors.name}
                maxLength={120}
                autoFocus
              />
            </Field>
            <Field
              label="Responsabilidades del cargo"
              error={positionFieldErrors.responsibilities}
              hint="Máximo 20 responsabilidades; cada una hasta 300 caracteres."
            >
              <ResponsibilitiesEditor
                idPrefix="position-responsibility"
                values={positionModal.responsibilities || []}
                onChange={(responsibilities) => setPositionModal({ ...positionModal, responsibilities })}
                disabled={busy}
              />
            </Field>
            {positionModal.id ? (
              <Field label="Estado" htmlFor="position-status">
                <Select
                  id="position-status"
                  value={positionModal.status}
                  onChange={(e) => setPositionModal({ ...positionModal, status: e.target.value })}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </Select>
              </Field>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
