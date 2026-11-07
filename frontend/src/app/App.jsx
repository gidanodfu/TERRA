import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { PERMISSIONS } from '../features/auth/permissions'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
import OnboardingPage from '../pages/OnboardingPage'
import WorkerHome from '../pages/worker/HomePage'
import WorkerProfile from '../pages/worker/ProfilePage'
import WorkerDrive from '../pages/worker/DrivePage'
import WorkerJobs from '../pages/worker/JobsPage'
import SecurityPage from '../pages/worker/SecurityPage'
import JobDetailPage from '../pages/JobDetailPage'
import AdminDashboard from '../pages/admin/DashboardPage'
import AdminWorkers from '../pages/admin/WorkersPage'
import WorkerDetailPage from '../pages/admin/WorkerDetailPage'
import OrganizationPage from '../pages/admin/OrganizationPage'
import ConnectionsPage from '../pages/admin/ConnectionsPage'
import DownloadWizardPage from '../pages/admin/DownloadWizardPage'
import AdminJobsPage from '../pages/admin/JobsPage'
import AuditPage from '../pages/admin/AuditPage'
import PolicyPage from '../pages/admin/PolicyPage'
import NotFoundPage from '../pages/NotFoundPage'
import PrivacyPage from '../pages/legal/PrivacyPage'
import TermsPage from '../pages/legal/TermsPage'
import LegalNoticePage from '../pages/legal/LegalNoticePage'
import CookiesPage from '../pages/legal/CookiesPage'
import { Spinner, Alert } from '../components/ui'

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Spinner /> Verificando sesión…
      </div>
    </div>
  )
}

function Protected({ children }) {
  const { user, loading, pendingProfile, mustRotate } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/" replace />
  if (pendingProfile) return <Navigate to="/onboarding" replace />
  if (mustRotate && location.pathname !== '/app/security') {
    return <Navigate to="/app/security" replace />
  }
  return children
}

function PermissionOnly({ permission, children }) {
  const { can } = useAuth()
  if (!can(permission)) return <AccessDenied />
  return children
}

function PermissionAny({ permissions, children }) {
  const { can } = useAuth()
  if (!permissions.some((permission) => can(permission))) return <AccessDenied />
  return children
}

function AccessDenied() {
  return (
    <div className="mx-auto max-w-lg">
      <Alert tone="error" title="Acceso no autorizado">
        Su cuenta no tiene permisos para acceder a este módulo.
      </Alert>
      <Link to="/app" className="btn-secondary">Volver al panel</Link>
    </div>
  )
}

function WorkerOnly({ children }) {
  const { isWorker } = useAuth()
  if (!isWorker) return <Navigate to="/app/security" replace />
  return children
}

function AppIndex() {
  const { can, isWorker } = useAuth()
  if (can(PERMISSIONS.DASHBOARD_READ)) return <Navigate to="/app/admin" replace />
  if (isWorker) return <WorkerHome />
  return <Navigate to="/app/security" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route caseSensitive path="/politica-de-privacidad" element={<PrivacyPage />} />
      <Route caseSensitive path="/terminos-y-condiciones" element={<TermsPage />} />
      <Route caseSensitive path="/aviso-legal" element={<LegalNoticePage />} />
      <Route caseSensitive path="/politica-de-cookies" element={<CookiesPage />} />

      <Route path="/Política-de-privacidad" element={<Navigate to="/politica-de-privacidad" replace />} />
      <Route path="/Politica-de-privacidad" element={<Navigate to="/politica-de-privacidad" replace />} />
      <Route path="/Términos-y-condiciones" element={<Navigate to="/terminos-y-condiciones" replace />} />
      <Route path="/Terminos-y-condiciones" element={<Navigate to="/terminos-y-condiciones" replace />} />
      <Route path="/Aviso-legal" element={<Navigate to="/aviso-legal" replace />} />
      <Route path="/Aviso-Legal" element={<Navigate to="/aviso-legal" replace />} />
      <Route path="/Política-de-cookies" element={<Navigate to="/politica-de-cookies" replace />} />
      <Route path="/Politica-de-cookies" element={<Navigate to="/politica-de-cookies" replace />} />

      <Route
        path="/app"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<AppIndex />} />
        <Route path="profile" element={<WorkerOnly><WorkerProfile /></WorkerOnly>} />
        <Route path="drive" element={<WorkerOnly><WorkerDrive /></WorkerOnly>} />
        <Route path="jobs" element={<WorkerOnly><WorkerJobs /></WorkerOnly>} />
        <Route path="jobs/:id" element={<WorkerOnly><JobDetailPage basePath="/app/jobs" /></WorkerOnly>} />
        <Route path="documents" element={<Navigate to="/app/jobs" replace />} />
        <Route path="security" element={<SecurityPage />} />

        <Route path="admin" element={<PermissionOnly permission={PERMISSIONS.DASHBOARD_READ}><AdminDashboard /></PermissionOnly>} />
        <Route path="admin/workers" element={<PermissionOnly permission={PERMISSIONS.USERS_READ}><AdminWorkers /></PermissionOnly>} />
        <Route path="admin/workers/:id" element={<PermissionOnly permission={PERMISSIONS.USERS_READ}><WorkerDetailPage /></PermissionOnly>} />
        <Route path="admin/organization" element={<PermissionOnly permission={PERMISSIONS.ORGANIZATION_READ}><OrganizationPage /></PermissionOnly>} />
        <Route path="admin/connections" element={<PermissionOnly permission={PERMISSIONS.DRIVE_READ}><ConnectionsPage /></PermissionOnly>} />
        <Route path="admin/downloads" element={<PermissionOnly permission={PERMISSIONS.JOBS_CREATE}><DownloadWizardPage /></PermissionOnly>} />
        <Route path="admin/jobs" element={<PermissionOnly permission={PERMISSIONS.JOBS_READ}><AdminJobsPage /></PermissionOnly>} />
        <Route path="admin/jobs/:id" element={<PermissionOnly permission={PERMISSIONS.JOBS_READ}><JobDetailPage basePath="/app/admin/jobs" /></PermissionOnly>} />
        <Route path="admin/storage" element={<Navigate to="/app/admin/jobs" replace />} />
        <Route path="admin/audit" element={
          <PermissionAny permissions={[PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_OPERATIONAL_READ]}>
            <AuditPage />
          </PermissionAny>
        } />
        <Route path="admin/policy" element={<PermissionOnly permission={PERMISSIONS.POLICY_WRITE}><PolicyPage /></PermissionOnly>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
