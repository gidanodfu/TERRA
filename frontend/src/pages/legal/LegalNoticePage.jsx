import LegalLayout, {
  LegalList,
  LegalNote,
  LegalP,
  LegalSubheading,
} from '../../layouts/LegalLayout'

const sections = [
  {
    title: 'Titularidad de TERRA',
    body: (
      <>
        <LegalP>
          TERRA es una aplicación institucional de gestión documental. La denominación legal del
          titular, su identificación fiscal, domicilio y representación están pendientes de
          confirmación por la institución.
        </LegalP>
        <LegalP>
          Este aviso no atribuye la titularidad a una persona, empresa o unidad administrativa no
          verificada.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Objeto y finalidad del sistema',
    body: (
      <>
        <LegalP>
          TERRA permite autorizar conexiones de Google Drive, ejecutar respaldos documentales,
          conservar snapshots y auditar las operaciones administrativas relacionadas.
        </LegalP>
        <LegalP>
          El sistema no es un portal de empleo, no gestiona postulaciones y no presta servicios
          distintos a los descritos en su documentación funcional.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Alcance de los servicios',
    body: (
      <LegalList items={[
        'Autenticación de trabajadores mediante Google OAuth.',
        'Acceso administrativo con credenciales locales y Turnstile.',
        'Exploración autorizada de Google Drive en modo lectura.',
        'Descarga y exportación de documentos dentro de snapshots.',
        'Gestión de trabajadores, cuentas administrativas, organización y políticas.',
        'Auditoría institucional y operacional según el rol.',
      ]} />
    ),
  },
  {
    title: 'Propiedad intelectual',
    body: (
      <>
        <LegalP>
          El código, la identidad visual y la documentación de TERRA pertenecen a la institución o
          a sus titulares correspondientes. Los documentos de Google Drive conservan la titularidad
          y condiciones que les sean aplicables.
        </LegalP>
        <LegalP>
          No se concede licencia alguna sobre documentos de terceros por el hecho de utilizar
          TERRA.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Servicios de terceros',
    body: (
      <>
        <LegalP>
          TERRA integra Google OAuth y Google Drive para la conexión y lectura autorizada de
          archivos. También utiliza Cloudflare Turnstile para la verificación del acceso
          administrativo.
        </LegalP>
        <LegalP>
          Estos servicios se rigen por sus propios términos y políticas. TERRA no controla sus
          mecanismos internos, disponibilidad ni cookies propias.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Responsabilidad y disponibilidad',
    body: (
      <>
        <LegalP>
          TERRA se ofrece como herramienta institucional sujeta a mantenimiento y configuración. No
          se garantiza disponibilidad ininterrumpida ni resultados libres de error.
        </LegalP>
        <LegalP>
          Los límites de responsabilidad, soporte y continuidad deben ser definidos por la
          institución en su marco normativo.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Enlaces externos',
    body: (
      <>
        <LegalP>
          TERRA puede mostrar enlaces a Google Drive para abrir archivos autorizados. Esos destinos
          son externos y su contenido no forma parte de TERRA.
        </LegalP>
        <LegalP>
          El acceso a un enlace externo queda sujeto a la disponibilidad y condiciones del servicio
          correspondiente.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Normativa aplicable',
    body: (
      <>
        <LegalP>
          La normativa aplicable, jurisdicción y mecanismos de resolución de controversias están
          pendientes de validación jurídica institucional.
        </LegalP>
        <LegalP>
          Este documento no constituye asesoría legal ni una interpretación oficial del marco
          normativo.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Contacto y datos pendientes',
    body: (
      <>
        <LegalSubheading>Pendiente de confirmación institucional</LegalSubheading>
        <LegalList items={[
          'Razón social o denominación oficial del titular.',
          'Identificación fiscal y domicilio.',
          'Correo, teléfono y canal oficial de atención.',
          'Autoridad o unidad responsable de la supervisión.',
          'Normativa y jurisdicción aplicables.',
        ]} />
        <LegalNote title="Borrador informativo">
          No se debe publicar como aviso legal definitivo hasta completar y validar estos datos.
        </LegalNote>
      </>
    ),
  },
]

export default function LegalNoticePage() {
  return (
    <LegalLayout
      title="Aviso legal"
      intro="Borrador de información sobre la titularidad, finalidad y alcance de TERRA como sistema institucional de gestión documental."
      sections={sections}
      currentPath="/aviso-legal"
    />
  )
}
