import LegalLayout, {
  LegalList,
  LegalNote,
  LegalP,
  LegalSubheading,
} from '../../layouts/LegalLayout'

const sections = [
  {
    title: 'Objeto y alcance',
    body: (
      <>
        <LegalP>
          TERRA es un sistema institucional para respaldar documentos de Google Drive, conservar
          snapshots y gestionar su trazabilidad. Estas condiciones describen el acceso y uso del
          sistema por trabajadores y cuentas administrativas.
        </LegalP>
        <LegalP>
          No regulan otros servicios institucionales ni sustituyen la normativa interna aplicable.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Acceso al sistema',
    body: (
      <>
        <LegalP>
          Los trabajadores acceden mediante Google OAuth. Las cuentas administrativas acceden con
          credenciales locales y verificación Turnstile.
        </LegalP>
        <LegalP>
          El acceso puede rechazarse si la cuenta está suspendida, desactivada, sin autorización
          suficiente o sin la política institucional aceptada.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Cuentas y credenciales',
    body: (
      <>
        <LegalP>
          Cada persona es responsable de sus credenciales y de la actividad realizada desde su
          cuenta. No se permite compartir contraseñas, tokens ni sesiones.
        </LegalP>
        <LegalP>
          Las contraseñas administrativas iniciales deben cambiarse en el primer acceso. TERRA
          conserva únicamente el hash Argon2id, nunca la contraseña en texto claro.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Responsabilidades de los trabajadores',
    body: (
      <LegalList items={[
        'Autorizar individualmente su cuenta de Google Drive.',
        'Aceptar la política institucional vigente antes de nuevas descargas.',
        'Revisar que la cuenta conectada corresponda a su identidad.',
        'Comunicar accesos no reconocidos, errores o pérdida de credenciales.',
        'No usar TERRA para finalidades ajenas a la institución.',
      ]} />
    ),
  },
  {
    title: 'Responsabilidades de los usuarios administrativos',
    body: (
      <>
        <LegalP>
          Los administradores gestionan trabajadores, cuentas administrativas, organización,
          conexiones, trabajos, almacenamiento, políticas y auditoría completa. Los moderadores
          gestionan trabajadores y consultan auditoría operacional. El rol de solo lectura consulta
          información institucional sin modificar datos.
        </LegalP>
        <LegalP>
          Las operaciones administrativas quedan auditadas. La protección del administrador
          principal impide desactivarlo y no puede eludirse desde la interfaz.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Roles y restricciones de acceso',
    body: (
      <>
        <LegalSubheading>Administrador</LegalSubheading>
        <LegalP>Administración integral, incluidas cuentas y configuraciones institucionales.</LegalP>
        <LegalSubheading>Moderador</LegalSubheading>
        <LegalP>
          Gestión operativa de trabajadores, consulta de conexiones y trabajos, y auditoría
          operacional. No administra cuentas ni configuraciones institucionales.
        </LegalP>
        <LegalSubheading>Solo lectura</LegalSubheading>
        <LegalP>
          Consulta institucional y auditoría completa. No modifica datos ni ejecuta operaciones.
        </LegalP>
        <LegalSubheading>Trabajador</LegalSubheading>
        <LegalP>Acceso únicamente a sus propios recursos y a su conexión de Drive.</LegalP>
      </>
    ),
  },
  {
    title: 'Conexión individual de Google Drive',
    body: (
      <>
        <LegalP>
          La conexión se autoriza por cada trabajador y utiliza permisos de solo lectura. TERRA no
          modifica, mueve ni comparte los archivos originales.
        </LegalP>
        <LegalP>
          El trabajador puede revocar la conexión. Si el token deja de ser válido, los trabajos
          pendientes pueden quedar en espera hasta que reconecte y acepte la política vigente.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Autorización para procesamiento documental',
    body: (
      <>
        <LegalP>
          Un administrador inicia el respaldo indicando el trabajador y el alcance: Mi unidad
          completa, carpetas seleccionadas o archivos individuales combinados con carpetas.
        </LegalP>
        <LegalP>
          TERRA valida las selecciones contra Google Drive antes de crear el trabajo. El trabajador
          debe haber aceptado la versión vigente de la política institucional.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Generación de snapshots',
    body: (
      <>
        <LegalP>
          Cada trabajo produce un snapshot independiente que conserva la estructura original de Mi
          unidad. Los archivos binarios se descargan sin conversión; los documentos nativos de
          Google se exportan a formatos admitidos.
        </LegalP>
        <LegalP>
          Los formularios se guardan como representación JSON de su definición. Google Vids no está
          soportado en esta versión. Los atajos se registran como referencias y no se recorren.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Uso permitido de documentos',
    body: (
      <LegalList items={[
        'Consultar y descargar únicamente documentos sobre los que exista autorización.',
        'Mantener la confidencialidad y el uso institucional de la información.',
        'No redistribuir documentos fuera de las finalidades autorizadas.',
        'No intentar eludir controles de acceso, límites o auditoría.',
      ]} />
    ),
  },
  {
    title: 'Seguridad y protección de cuentas',
    body: (
      <>
        <LegalP>
          TERRA aplica sesiones del lado del servidor, protección CSRF, limitación de solicitudes,
          autorización RBAC y auditoría. Las credenciales y tokens no deben exponerse en registros,
          capturas ni canales no autorizados.
        </LegalP>
        <LegalP>
          Cualquier incidente de seguridad debe comunicarse por el canal institucional que defina la
          institución.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Disponibilidad y mantenimiento',
    body: (
      <>
        <LegalP>
          TERRA puede requerir mantenimiento, actualizaciones o interrupciones. No se establece un
          nivel de servicio ni un plazo de disponibilidad en este borrador; la institución debe
          definirlos.
        </LegalP>
        <LegalP>
          Los respaldos y la conservación dependen de la configuración institucional del
          almacenamiento y de PostgreSQL.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Actualizaciones de las condiciones',
    body: (
      <>
        <LegalP>
          La institución puede publicar nuevas versiones de estas condiciones. Las versiones
          anteriores se conservan y la aceptación de políticas queda registrada cuando corresponda.
        </LegalP>
        <LegalNote title="Borrador informativo">
          La versión definitiva debe ser revisada y aprobada institucionalmente antes de su
          publicación.
        </LegalNote>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalLayout
      title="Términos y condiciones"
      intro="Borrador de condiciones de acceso y uso de TERRA para trabajadores y cuentas administrativas, conforme a las responsabilidades y restricciones reales del sistema."
      sections={sections}
      currentPath="/terminos-y-condiciones"
    />
  )
}
