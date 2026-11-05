import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { PERMISSIONS } from '../../features/auth/permissions'
import { Button, PageHeader } from '../../components/ui'
import WorkersPanel from './WorkersPanel'
import AdministrativeAccountsPanel from './AdministrativeAccountsPanel'

export default function AdminWorkers() {
  const { can } = useAuth()
  const [view, setView] = useState('workers')
  const [createOpen, setCreateOpen] = useState(false)
  const canReadAccounts = can(PERMISSIONS.ACCOUNTS_READ)
  const canCreateAccounts = can(PERMISSIONS.ACCOUNTS_CREATE)

  const openCreate = () => {
    setView('administrative')
    setCreateOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Trabajadores"
        description="Gestione trabajadores y, si su rol lo permite, las cuentas administrativas de TERRA."
        actions={canCreateAccounts ? (
          <Button onClick={openCreate}>
            <UserPlus className="h-4 w-4" /> Nuevo usuario administrativo
          </Button>
        ) : null}
      />

      <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200" role="tablist" aria-label="Tipo de cuenta">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'workers'}
          onClick={() => setView('workers')}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            view === 'workers' ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="mr-1 inline h-4 w-4" /> Trabajadores
        </button>
        {canReadAccounts ? (
          <button
            type="button"
            role="tab"
            aria-selected={view === 'administrative'}
            onClick={() => setView('administrative')}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              view === 'administrative' ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="mr-1 inline h-4 w-4" /> Usuarios administrativos
          </button>
        ) : null}
      </div>

      {view === 'administrative' && canReadAccounts ? (
        <AdministrativeAccountsPanel createOpen={createOpen} onCloseCreate={() => setCreateOpen(false)} />
      ) : (
        <WorkersPanel />
      )}
    </div>
  )
}
