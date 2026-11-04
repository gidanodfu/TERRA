import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ExternalLink, Link2Off, RefreshCw, ShieldCheck } from 'lucide-react'
import { api } from '../../services/api'
import {
  Alert,
  Button,
  Card,
  CardBody,
  DetailRow,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
} from '../../components/ui'
import { StatusBadge } from '../../features/downloads/StatusBadge'
import { formatDate } from '../../utils/format'

export default function WorkerDrive() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)

  const load = useCallback(async () => {
    try {
      const result = await api.get('/me/drive/connection')
      setData(result)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
    if (params.get('connected')) {
      setSuccess('Google Drive se conectó correctamente.')
      setParams({}, { replace: true })
    } else if (params.get('error')) {
      const messages = {
        account_mismatch: 'La cuenta de Google autorizada no corresponde a su cuenta TERRA. Inicie el proceso nuevamente.',
        oauth_denied: 'Se canceló la autorización en Google.',
        oauth_state: 'La autorización expiró. Intente conectar nuevamente.',
        drive_connect_failed: 'No fue posible conectar Google Drive. Intente nuevamente.',
      }
      setError(messages[params.get('error')] || 'No fue posible conectar Google Drive.')
      setParams({}, { replace: true })
    }
  }, [load, params, setParams])

  const connect = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await api.post('/me/drive/connect', { redirect_after: '/app/drive' })
      window.location.assign(result.authorization_url)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError('')
    try {
      await api.delete('/me/drive/connection')
      setConfirmDisconnect(false)
      setSuccess('La conexión de Google Drive fue revocada. Puede reconectarla cuando lo necesite.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const acceptPolicy = async () => {
    if (!consentChecked) {
      setError('Debe marcar la aceptación de la política institucional.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post('/me/drive/consent', { version: data.policy.version })
      setSuccess('Política institucional aceptada.')
      setConsentChecked(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data && !error) return <LoadingBlock />
  const connection = data?.connection
  const policy = data?.policy
  const consentCurrent = connection && policy && connection.policy_consent_version === policy.version

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Conexión de Google Drive"
        description="TERRA accede únicamente en modo lectura, con su autorización personal e individual."
      />

      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success" onClose={() => setSuccess('')}>{success}</Alert> : null}

      <Card>
        <CardBody>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">Cuenta autorizada</h2>
                  <StatusBadge type="connection" status={connection?.status || 'revoked'} />
                </div>
                <p className="mt-1 wrap-anywhere text-sm text-slate-500">
                  {connection?.google_email || 'Aún no ha autorizado una cuenta de Google.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {connection?.status === 'connected' ? (
                <>
                  <Button variant="secondary" onClick={connect} disabled={busy}>
                    <RefreshCw className="h-4 w-4" /> Reconectar
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmDisconnect(true)} disabled={busy}>
                    <Link2Off className="h-4 w-4" /> Desconectar
                  </Button>
                </>
              ) : (
                <Button onClick={connect} disabled={busy}>
                  {busy ? <Spinner className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                  {connection ? 'Reautorizar Google Drive' : 'Conectar Google Drive'}
                </Button>
              )}
            </div>
          </div>

          {connection ? (
            <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 pt-2">
              <DetailRow label="Correo de Google">{connection.google_email || '—'}</DetailRow>
              <DetailRow label="Conectado desde">{formatDate(connection.connected_at)}</DetailRow>
              <DetailRow label="Última renovación de token">{formatDate(connection.last_refreshed_at)}</DetailRow>
              <DetailRow label="Permisos otorgados">
                <span className="break-all text-xs">{connection.scopes || '—'}</span>
              </DetailRow>
              {connection.last_error_code ? (
                <DetailRow label="Último error">
                  <span className="text-red-700">{connection.last_error_code}</span>
                </DetailRow>
              ) : null}
            </dl>
          ) : null}

          {connection && connection.status !== 'connected' ? (
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                La autorización ya no es válida. Mientras no reconecte su cuenta, no se pueden iniciar nuevas descargas
                institucionales ni continuar las que estén en espera.
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody>
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-slate-900">Política institucional</h2>
              {!policy ? (
                <p className="mt-2 text-sm text-slate-600">
                  Todavía no existe una versión publicada. Un administrador debe publicar la política aprobada antes de
                  iniciar descargas institucionales.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-slate-500">
                    Versión vigente <strong className="text-slate-700">{policy.version}</strong> · publicada el{' '}
                    {formatDate(policy.published_at)}
                  </p>
                  <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700">
                      Leer el contenido de la política
                    </summary>
                    <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                      {policy.content}
                    </div>
                  </details>

                  {consentCurrent ? (
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" /> Aceptó esta versión el{' '}
                      {formatDate(connection.policy_consent_at)}.
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-slate-200 p-4">
                      <p className="text-sm text-slate-600">
                        Para habilitar la exploración y las descargas institucionales debe aceptar personalmente la
                        versión vigente. Un administrador no puede aceptarla en su nombre.
                      </p>
                      <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 accent-brand-700"
                          checked={consentChecked}
                          onChange={(e) => setConsentChecked(e.target.checked)}
                        />
                        <span>
                          He leído y acepto la política institucional versión <strong>{policy.version}</strong>.
                        </span>
                      </label>
                      <Button className="mt-3" onClick={acceptPolicy} disabled={busy || !connection}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        Aceptar política
                      </Button>
                      {!connection ? (
                        <p className="mt-2 text-xs text-slate-500">Conecte primero su cuenta de Google Drive.</p>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody>
          <h2 className="font-semibold text-slate-900">Qué autoriza TERRA</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>• Lectura de archivos y carpetas de su Mi unidad, únicamente cuando un administrador inicia un respaldo.</li>
            <li>• Descarga de documentos nativos de Google en formato DOCX, XLSX o PPTX.</li>
            <li>• Ninguna modificación, movimiento, eliminación o compartición de sus archivos originales.</li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            TERRA nunca recibe su contraseña de Google. El token de actualización se almacena cifrado en el servidor y
            jamás se envía al navegador.
          </p>
        </CardBody>
      </Card>

      <Modal
        open={confirmDisconnect}
        title="Desconectar Google Drive"
        onClose={() => setConfirmDisconnect(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDisconnect(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={disconnect} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null} Desconectar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Se revocará el acceso de TERRA a su cuenta de Google. Los documentos ya resguardados y el historial se
          conservan. Los trabajos pendientes quedarán en espera hasta que reconecte su cuenta.
        </p>
      </Modal>
    </div>
  )
}
