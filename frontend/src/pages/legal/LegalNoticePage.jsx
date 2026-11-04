import LegalLayout, { PendingText } from '../../layouts/LegalLayout'

const sections = [
  { title: 'Titular del sitio', body: <PendingText /> },
  { title: 'Objeto del aviso', body: <PendingText /> },
  { title: 'Propiedad intelectual', body: <PendingText /> },
  { title: 'Enlaces y servicios de terceros', body: <PendingText /> },
  { title: 'Responsabilidad', body: <PendingText /> },
  { title: 'Legislación aplicable', body: <PendingText /> },
]

export default function LegalNoticePage() {
  return (
    <LegalLayout
      title="Aviso legal"
      intro="Información general sobre el sitio y su titularidad institucional."
      sections={sections}
      currentPath="/aviso-legal"
    />
  )
}
