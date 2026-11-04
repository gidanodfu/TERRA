import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import AppLayout from '../layouts/AppLayout'
import LoginPage from '../pages/LoginPage'
import OnboardingPage from '../pages/OnboardingPage'
import WorkerHome from '../pages/worker/HomePage'
import WorkerProfile from '../pages/worker/ProfilePage'
import WorkerDrive from '../pages/worker/DrivePage'
import WorkerJobs from '../pages/worker/JobsPage'
import WorkerDocuments from '../pages/worker/DocumentsPage'
import SecurityPage from '../pages/worker/SecurityPage'
import JobDetailPage from '../pages/JobDetailPage'
import AdminDashboard from '../pages/admin/DashboardPage'
import AdminWorkers from '../pages/admin/WorkersPage'
import WorkerDetailPage from '../pages/admin/WorkerDetailPage'
import OrganizationPage from '../pages/admin/OrganizationPage'
import ConnectionsPage from '../pages/admin/ConnectionsPage'
import DownloadWizardPage from '../pages/admin/DownloadWizardPage'
import AdminJobsPage from '../pages/admin/JobsPage'
import StoragePage from '../pages/admin/StoragePage'
import AuditPage from '../pages/admin/AuditPage'
import PolicyPage from '../pages/admin/PolicyPage'
import NotFoundPage from '../pages/NotFoundPage'
import PrivacyPage from '../pages/legal/PrivacyPage'
import TermsPage from '../pages/legal/TermsPage'
import LegalNoticePage from '../pages/legal/LegalNoticePage'
import CookiesPage from '../pages/legal/CookiesPage'
import { Spinner } from '../components/ui'

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

function AdminOnly({ children }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/app" replace />
  return children
}

function AppIndex() {
  const { isAdmin } = useAuth()
  return isAdmin ? <Navigate to="/app/admin" replace /> : <WorkerHome />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      <Route path="/politica-de-privacidad" element={<PrivacyPage />} />
      <Route path="/terminos-y-condiciones" element={<TermsPage />} />
      <Route path="/aviso-legal" element={<LegalNoticePage />} />
      <Route path="/politica-de-cookies" element={<CookiesPage />} />

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
        <Route path="profile" element={<WorkerProfile />} />
        <Route path="drive" element={<WorkerDrive />} />
        <Route path="jobs" element={<WorkerJobs />} />
        <Route path="jobs/:id" element={<JobDetailPage basePath="/app/jobs" />} />
        <Route path="documents" element={<WorkerDocuments />} />
        <Route path="security" element={<SecurityPage />} />

        <Route path="admin" element={<AdminOnly><AdminDashboard /></AdminOnly>} />
        <Route path="admin/workers" element={<AdminOnly><AdminWorkers /></AdminOnly>} />
        <Route path="admin/workers/:id" element={<AdminOnly><WorkerDetailPage /></AdminOnly>} />
        <Route path="admin/organization" element={<AdminOnly><OrganizationPage /></AdminOnly>} />
        <Route path="admin/connections" element={<AdminOnly><ConnectionsPage /></AdminOnly>} />
        <Route path="admin/downloads" element={<AdminOnly><DownloadWizardPage /></AdminOnly>} />
        <Route path="admin/jobs" element={<AdminOnly><AdminJobsPage /></AdminOnly>} />
        <Route path="admin/jobs/:id" element={<AdminOnly><JobDetailPage basePath="/app/admin/jobs" /></AdminOnly>} />
        <Route path="admin/storage" element={<AdminOnly><StoragePage /></AdminOnly>} />
        <Route path="admin/audit" element={<AdminOnly><AuditPage /></AdminOnly>} />
        <Route path="admin/policy" element={<AdminOnly><PolicyPage /></AdminOnly>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
