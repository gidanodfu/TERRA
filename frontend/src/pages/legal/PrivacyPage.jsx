import LegalLayout, { PendingText } from '../../layouts/LegalLayout'

const sections = [
  { title: 'Responsable del tratamiento', body: <PendingText /> },
  { title: 'Datos personales tratados', body: <PendingText /> },
  { title: 'Finalidades del tratamiento', body: <PendingText /> },
  { title: 'Conservación de la información', body: <PendingText /> },
  { title: 'Derechos de las personas', body: <PendingText /> },
  { title: 'Contacto institucional', body: <PendingText /> },
]

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de privacidad"
      intro="Información sobre el tratamiento de datos personales en TERRA."
      sections={sections}
      currentPath="/politica-de-privacidad"
    />
  )
}
