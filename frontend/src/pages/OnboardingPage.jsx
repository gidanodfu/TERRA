import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BadgeCheck, Building2, UserRound } from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { Card, CardBody, LoadingBlock, PageHeader } from '../components/ui'
import ProfileForm from '../features/profile/ProfileForm'

export default function OnboardingPage() {
  const { user, loading, pendingProfile, refresh } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user && !pendingProfile) navigate('/app', { replace: true })
  }, [loading, user, pendingProfile, navigate])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <LoadingBlock label="Verificando su cuenta…" />
      </div>
    )
  }
  if (!user) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-700 font-bold text-white">T</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">TERRA</p>
            <p className="text-xs text-slate-500">Configuración inicial</p>
          </div>
        </div>
      </header>
      <main className="@container mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          title="Complete su perfil"
          description="Necesitamos sus datos y su asignación organizativa para activar su cuenta institucional."
        />

        <div className="mb-5 grid gap-3 @lg:grid-cols-3">
          <div className="card flex items-center gap-3 p-4">
            <UserRound className="h-5 w-5 text-brand-700" />
            <span className="text-sm text-slate-600">Datos personales</span>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <Building2 className="h-5 w-5 text-brand-700" />
            <span className="text-sm text-slate-600">Área y cargo</span>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <BadgeCheck className="h-5 w-5 text-brand-700" />
            <span className="text-sm text-slate-600">Perfil activo</span>
          </div>
        </div>

        <Card>
          <CardBody>
            <div className="mb-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Cuenta de Google verificada: <strong className="text-slate-800">{user.email || '—'}</strong>
            </div>
            <ProfileForm
              user={user}
              submitLabel="Activar mi perfil"
              onSaved={async () => {
                await refresh()
                navigate('/app', { replace: true })
              }}
            />
          </CardBody>
        </Card>
      </main>
    </div>
  )
}
