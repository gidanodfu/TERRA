import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  Building2,
  Database,
  FileClock,
  FolderTree,
  HardDrive,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import ThemeToggle from '../components/ThemeToggle'
import { PERMISSIONS } from '../features/auth/permissions'

const workerNav = [
  { to: '/app', label: 'Inicio', icon: Home, end: true },
  { to: '/app/profile', label: 'Mi perfil', icon: UserRound },
  { to: '/app/drive', label: 'Google Drive', icon: HardDrive },
  { to: '/app/jobs', label: 'Mis descargas', icon: ListChecks },
  { to: '/app/documents', label: 'Mis documentos', icon: FolderTree },
  { to: '/app/security', label: 'Seguridad', icon: ShieldCheck },
]

const adminNav = [
  { to: '/app/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, permission: PERMISSIONS.DASHBOARD_READ },
  { to: '/app/admin/workers', label: 'Trabajadores', icon: Users, permission: PERMISSIONS.USERS_READ },
  { to: '/app/admin/organization', label: 'Áreas y cargos', icon: Building2, permission: PERMISSIONS.ORGANIZATION_READ },
  { to: '/app/admin/connections', label: 'Conexiones Drive', icon: Database, permission: PERMISSIONS.DRIVE_READ },
  { to: '/app/admin/downloads', label: 'Descargas', icon: ArrowLeftRight, permission: PERMISSIONS.JOBS_CREATE },
  { to: '/app/admin/jobs', label: 'Trabajos', icon: FileClock, permission: PERMISSIONS.JOBS_READ },
  { to: '/app/admin/storage', label: 'Almacenamiento', icon: HardDrive, permission: PERMISSIONS.STORAGE_READ },
  { to: '/app/admin/audit', label: 'Auditoría', icon: ScrollText, permission: [PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_OPERATIONAL_READ] },
  { to: '/app/admin/policy', label: 'Política', icon: KeyRound, permission: PERMISSIONS.POLICY_WRITE },
]

const securityNav = { to: '/app/security', label: 'Seguridad', icon: ShieldCheck }

const roleLabels = {
  admin: 'Administrador',
  moderator: 'Moderador',
  read_only: 'Solo lectura',
  user: 'Trabajador',
}

function currentSection(nav, pathname, fallback) {
  const match = nav.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))
  return match?.label || fallback
}

function Sidebar({ nav, user, onLogout, onNavigate }) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-700 font-bold text-white">T</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">TERRA</p>
          <p className="truncate text-xs text-slate-500">Gestión documental</p>
        </div>
      </div>

      <nav className="admin-scroll-container min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="rounded-xl bg-muted px-3 py-3">
          <p className="truncate text-sm font-medium text-slate-800" title={user?.display_name || user?.email}>{user?.display_name || user?.email}</p>
          <p className="truncate text-xs text-slate-500">{roleLabels[user?.roles?.[0]] || 'Usuario'}</p>
          {user?.area_name ? <p className="mt-1 truncate text-xs text-slate-400" title={user.area_name}>{user.area_name}</p> : null}
        </div>
        <div className="mt-2 flex items-stretch gap-2">
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Cerrar sesión</span>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}

export default function AppLayout() {
  const { user, isAdministrative, isWorker, can, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const nav = isWorker
    ? workerNav
    : [...adminNav.filter((item) => !item.permission || (Array.isArray(item.permission) ? item.permission.some(can) : can(item.permission))), securityNav]

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  const headerLabel = isAdministrative ? 'Panel administrativo' : isWorker ? 'Panel del trabajador' : 'Panel restringido'
  const sectionLabel = currentSection(nav, location.pathname, headerLabel)
  const testIds = isWorker
    ? { sidebar: 'worker-sidebar', workspace: 'worker-workspace', scroll: 'worker-scroll', drawer: 'worker-drawer' }
    : { sidebar: 'admin-sidebar', workspace: 'admin-workspace', scroll: 'admin-scroll', drawer: 'admin-drawer' }
  const sidebar = (
    <Sidebar nav={nav} user={user} onLogout={handleLogout} onNavigate={() => setOpen(false)} />
  )

  return (
    <div className="h-dvh bg-shell p-3 sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-[1920px] gap-3 sm:gap-4">
        <aside
          data-testid={testIds.sidebar}
          className="hidden shrink-0 overflow-hidden rounded-[22px] border border-slate-200 bg-sidebar-background shadow-sm md:flex md:h-full md:w-[clamp(210px,17vw,232px)]"
        >
          {sidebar}
        </aside>

        <div
          data-testid={testIds.workspace}
          className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-surface shadow-sm"
        >
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700">
                {headerLabel}
                <span className="text-slate-400"> · </span>
                {sectionLabel}
              </p>
            </div>
            <div className="hidden items-center gap-2 @xl:flex">
              <span
                className="max-w-[10rem] truncate rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 @3xl:max-w-[14rem] @5xl:max-w-[16rem]"
                title={user?.area_name || 'Sin área'}
              >
                {user?.area_name || 'Sin área'}
              </span>
              <span className="max-w-[8rem] truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {roleLabels[user?.roles?.[0]] || 'Usuario'}
              </span>
            </div>
          </header>

          <div
            data-testid={testIds.scroll}
            tabIndex={0}
            aria-label={`Contenido del ${headerLabel.toLowerCase()}`}
            className="admin-scroll-container min-h-0 min-w-0 flex-1 overflow-y-auto"
          >
            <main className="@container mx-auto w-full px-4 py-6 sm:px-6 lg:px-7 lg:py-8">
              <Outlet />
            </main>
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 dark:bg-black/70"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <aside
            data-testid={testIds.drawer}
            className="relative m-3 flex h-[calc(100dvh-1.5rem)] w-[280px] max-w-[85vw] flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-sidebar-background shadow-xl"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
