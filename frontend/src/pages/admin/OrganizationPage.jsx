import { useCallback, useEffect, useState } from 'react'
import { Building2, Pencil, Plus } from 'lucide-react'
import { api } from '../../services/api'
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

export default function OrganizationPage() {
  const [areas, setAreas] = useState(null)
  const [selectedArea, setSelectedArea] = useState(null)
  const [positions, setPositions] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [areaModal, setAreaModal] = useState(null)
  const [positionModal, setPositionModal] = useState(null)
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
    setBusy(true)
    setError('')
    try {
      if (areaModal.id) {
        await api.patch(`/admin/areas/${areaModal.id}`, { name: areaModal.name, status: areaModal.status })
        setSuccess('Área actualizada.')
      } else {
        await api.post('/admin/areas', { name: areaModal.name })
        setSuccess('Área creada.')
      }
      setAreaModal(null)
      await loadAreas()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const savePosition = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (positionModal.id) {
        await api.patch(`/admin/positions/${positionModal.id}`, { name: positionModal.name, status: positionModal.status })
        setSuccess('Cargo actualizado.')
      } else {
        await api.post(`/admin/areas/${selectedArea.id}/positions`, { name: positionModal.name })
        setSuccess('Cargo creado.')
      }
      setPositionModal(null)
      setPositions(null)
      const data = await api.get(`/admin/areas/${selectedArea.id}/positions`)
      setPositions(data.data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Áreas y cargos"
        description="Catálogo organizativo municipal. Los cargos pertenecen siempre a un área y nunca otorgan permisos de sistema."
        actions={
          <Button onClick={() => setAreaModal({ name: '', status: 'active' })}>
            <Plus className="h-4 w-4" /> Nueva área
          </Button>
        }
      />

      {error ? <Alert tone="error" onClose={() => setError('')}>{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess('')}>{success}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
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
                        selectedArea?.id === area.id ? 'bg-brand-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <p className={`truncate text-sm font-medium ${selectedArea?.id === area.id ? 'text-brand-900' : 'text-slate-800'}`}>
                        {area.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {area.status === 'active' ? 'Activa' : 'Inactiva'} · {area.position_count} cargos · {area.user_count} trabajadores
                      </p>
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => setAreaModal({ id: area.id, name: area.name, status: area.status })}
                      aria-label={`Editar ${area.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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
              <Button
                variant="secondary"
                onClick={() => setPositionModal({ name: '', status: 'active' })}
                disabled={!selectedArea}
              >
                <Plus className="h-4 w-4" /> Nuevo cargo
              </Button>
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
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => setPositionModal({ id: position.id, name: position.name, status: position.status })}
                      aria-label={`Editar ${position.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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
            <Field label="Nombre del área" htmlFor="area-name">
              <Input
                id="area-name"
                value={areaModal.name}
                onChange={(e) => setAreaModal({ ...areaModal, name: e.target.value })}
                maxLength={120}
                autoFocus
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
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Área: {selectedArea?.name}</p>
            <Field label="Nombre del cargo" htmlFor="position-name">
              <Input
                id="position-name"
                value={positionModal.name}
                onChange={(e) => setPositionModal({ ...positionModal, name: e.target.value })}
                maxLength={120}
                autoFocus
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
