import LegalLayout, { PendingText } from '../../layouts/LegalLayout'

const sections = [
  { title: 'Qué son las cookies', body: <PendingText /> },
  { title: 'Cookies utilizadas por TERRA', body: <PendingText /> },
  { title: 'Finalidad', body: <PendingText /> },
  { title: 'Gestión y configuración', body: <PendingText /> },
  { title: 'Actualizaciones de esta política', body: <PendingText /> },
]

export default function CookiesPage() {
  return (
    <LegalLayout
      title="Política de cookies"
      intro="Información sobre el uso de cookies y tecnologías similares en TERRA."
      sections={sections}
      currentPath="/politica-de-cookies"
    />
  )
}
