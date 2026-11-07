import { useEffect, useState } from 'react'
import { FileText, ShieldCheck } from 'lucide-react'
import { api } from '../../services/api'
import {
  Alert,
  Button,
  Card,
  CardBody,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Spinner,
  Textarea,
} from '../../components/ui'
import { formatDate } from '../../utils/format'

export default function PolicyPage() {
  const [current, setCurrent] = useState(undefined)
  const [form, setForm] = useState({ version: '', content: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    api
      .get('/public/policy')
      .then((data) => setCurrent(data))
      .catch((err) => {
        if (err.status === 404) setCurrent(null)
        else setError(err.message)
      })
  }

  useEffect(() => {
    load()
  }, [])

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const publish = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setErrors({})
    setSuccess('')
    try {
      await api.post('/admin/policies', form)
      setSuccess('Versión publicada. Los trabajadores deberán aceptarla antes de nuevas descargas.')
      setForm({ version: '', content: '' })
      load()
    } catch (err) {
      setError(err.message)
      if (err.fields) setErrors(err.fields)
    } finally {
      setBusy(false)
    }
  }

  if (current === undefined) return <LoadingBlock />

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <PageHeader
        title="Política institucional"
        description="El consentimiento OAuth no sustituye la política municipal. Publique únicamente versiones aprobadas por la institución."
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess('')}>{success}</Alert> : null}

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="flex h-full flex-col">
          <CardBody className="flex flex-1 flex-col">
            <div className="mb-3 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-brand-700" />
              <h2 className="font-semibold text-slate-900">Versión vigente</h2>
            </div>
            {!current ? (
              <p className="text-sm text-slate-500">No hay una política publicada. Publique la primera versión aprobada.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span className="rounded-full bg-brand-50 px-3 py-1 font-medium text-brand-800">{current.version}</span>
                  <span>Publicada el {formatDate(current.published_at)}</span>
                </div>
                <div className="mt-3 max-h-[34rem] min-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-muted p-4 text-sm leading-relaxed text-slate-700">
                  {current.content}
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="mb-4 flex items-center gap-3">
              <FileText className="h-5 w-5 text-slate-600" />
              <div>
                <h2 className="font-semibold text-slate-900">Publicar nueva versión</h2>
                <p className="text-xs text-slate-500">Las versiones anteriores se conservan; cada conexión registra la versión aceptada.</p>
              </div>
            </div>
            <form onSubmit={publish} className="space-y-4">
              <Field label="Identificador de versión" htmlFor="version" error={errors.version} hint="Ejemplo: 2026-01. Debe ser único.">
                <Input
                  id="version"
                  value={form.version}
                  onChange={(e) => update('version', e.target.value)}
                  maxLength={60}
                  error={errors.version}
                  placeholder="2026-01"
                />
              </Field>
              <Field label="Contenido aprobado" htmlFor="content" error={errors.content}>
                <Textarea
                  id="content"
                  value={form.content}
                  onChange={(e) => update('content', e.target.value)}
                  error={errors.content}
                  placeholder="Texto completo de la política institucional aprobada…"
                  className="min-h-48 resize-y leading-relaxed sm:min-h-52"
                />
              </Field>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : null} Publicar versión
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
