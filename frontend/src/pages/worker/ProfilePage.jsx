import { useNavigate } from 'react-router-dom'
import { UserRound } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { Card, CardBody, PageHeader } from '../../components/ui'
import ProfileForm from '../../features/profile/ProfileForm'

export default function WorkerProfile() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mi perfil"
        description="Sus datos personales y su asignación organizativa vigente. Todo cambio de área o cargo queda registrado."
      />
      <Card>
        <CardBody>
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-muted p-4">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-brand-800">
              <UserRound className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="wrap-anywhere font-medium text-slate-900">{user?.display_name || user?.email}</p>
              <p className="wrap-anywhere text-xs text-slate-500">{user?.email || 'Cuenta de Google verificada'}</p>
            </div>
          </div>
          <ProfileForm
            user={user}
            onSaved={async () => {
              await refresh()
              navigate('/app')
            }}
          />
        </CardBody>
      </Card>
    </div>
  )
}
