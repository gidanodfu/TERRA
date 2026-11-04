import LegalLayout, { PendingText } from '../../layouts/LegalLayout'

const sections = [
  { title: 'Objeto y alcance', body: <PendingText /> },
  { title: 'Acceso al sistema', body: <PendingText /> },
  { title: 'Uso aceptable', body: <PendingText /> },
  { title: 'Propiedad y resguardo de documentos', body: <PendingText /> },
  { title: 'Disponibilidad del servicio', body: <PendingText /> },
  { title: 'Vigencia y modificaciones', body: <PendingText /> },
]

export default function TermsPage() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      intro="Condiciones aplicables al acceso y uso de TERRA."
      sections={sections}
      currentPath="/terminos-y-condiciones"
    />
  )
}
