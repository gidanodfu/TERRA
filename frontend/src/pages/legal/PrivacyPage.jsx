import LegalLayout, {
  LegalList,
  LegalNote,
  LegalP,
  LegalSubheading,
} from '../../layouts/LegalLayout'

const sections = [
  {
    title: 'Responsable del tratamiento y alcance',
    body: (
      <>
        <LegalP>
          TERRA es un sistema institucional de gestión documental. La identidad legal del
          responsable del tratamiento, su domicilio y los medios de contacto oficiales están
          pendientes de confirmación por la institución.
        </LegalP>
        <LegalP>
          Este documento describe el tratamiento realizado por TERRA para cuentas de trabajadores
          y cuentas administrativas. No regula otros sistemas institucionales.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Datos de identificación y perfiles',
    body: (
      <>
        <LegalP>
          TERRA conserva datos necesarios para identificar y clasificar a los trabajadores:
          nombres, correo, área, cargo, estado de la cuenta, roles asignados y fechas de acceso.
        </LegalP>
        <LegalP>
          Cuando una cuenta se autentica con Google, se registra la identidad verificada de Google
          (subject y correo). TERRA no recibe ni almacena la contraseña personal de Google.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Información de cuentas administrativas',
    body: (
      <>
        <LegalP>
          Las cuentas administrativas tienen usuario local, hash de contraseña con Argon2id, rol,
          estado, fechas de acceso y eventos de auditoría. La contraseña nunca se almacena ni se
          devuelve en texto claro.
        </LegalP>
        <LegalP>
          Los roles disponibles son administrador, moderador y solo lectura. Sus permisos efectivos
          se calculan en el servidor.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Autenticación con Google',
    body: (
      <>
        <LegalP>
          El acceso de trabajadores utiliza OAuth con Google. TERRA solicita la identidad básica y
          verifica que el correo esté confirmado. No utiliza el identificador de Google como única
          prueba: valida la respuesta del proveedor.
        </LegalP>
        <LegalNote title="Sin contraseñas de Google">
          TERRA no solicita, recibe ni almacena contraseñas personales de Google.
        </LegalNote>
      </>
    ),
  },
  {
    title: 'Conexión autorizada de Google Drive',
    body: (
      <>
        <LegalP>
          La conexión de Google Drive es individual y requiere autorización expresa del trabajador.
          TERRA solicita únicamente permiso de lectura del contenido autorizado.
        </LegalP>
        <LegalP>
          El token de actualización se cifra y se conserva en el servidor. No se envía al navegador
          ni se expone en la interfaz. El trabajador puede revocar la conexión desde TERRA.
        </LegalP>
        <LegalP>
          El trabajador debe aceptar la política institucional vigente antes de iniciar nuevas
          descargas. La versión aceptada queda registrada.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Metadatos de archivos y snapshots',
    body: (
      <>
        <LegalP>
          TERRA registra metadatos observados de Google Drive, como nombre, tipo MIME, tamaño,
          fechas, enlace, marcas y relaciones entre carpetas. El contenido documental se almacena
          fuera de PostgreSQL, en el almacenamiento institucional configurado.
        </LegalP>
        <LegalP>
          Cada trabajo genera un snapshot independiente que conserva la estructura original de Mi
          unidad. Las rutas internas se guardan de forma relativa al almacenamiento.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Finalidades del tratamiento',
    body: (
      <LegalList items={[
        'Autenticar cuentas y aplicar controles de acceso.',
        'Clasificar trabajadores por área, cargo y estado.',
        'Ejecutar respaldos documentales autorizados por la institución.',
        'Registrar auditoría de operaciones administrativas y de seguridad.',
        'Prevenir abuso, accesos no autorizados y errores operativos.',
        'Conservar la trazabilidad de snapshots, políticas aceptadas y trabajos.',
      ]} />
    ),
  },
  {
    title: 'Conservación de la información',
    body: (
      <>
        <LegalP>
          Los plazos institucionales de conservación están pendientes de definición. TERRA permite
          aplicar una retención configurable de snapshots; si no se configura, la retención
          automática permanece desactivada.
        </LegalP>
        <LegalP>
          Las copias de seguridad y los documentos se conservan en ubicaciones externas al
          repositorio. La eliminación definitiva requiere una operación administrativa o
          institucional autorizada.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Controles de acceso',
    body: (
      <>
        <LegalP>
          TERRA aplica autorización en el servidor mediante roles y permisos. Ocultar una opción en
          la interfaz no sustituye esa comprobación.
        </LegalP>
        <LegalList items={[
          'Sesiones del lado del servidor con cookie HttpOnly.',
          'Protección CSRF en operaciones que modifican datos.',
          'Limitación de intentos y de solicitudes.',
          'Auditoría de operaciones sensibles.',
          'Separación entre trabajadores, moderadores, solo lectura y administradores.',
        ]} />
      </>
    ),
  },
  {
    title: 'Seguridad de credenciales y sesiones',
    body: (
      <>
        <LegalP>
          Las contraseñas administrativas se almacenan con Argon2id. Las cookies de sesión no son
          accesibles desde JavaScript; la cookie CSRF se utiliza para validar operaciones no
          seguras. Los tokens de Google se cifran en el servidor.
        </LegalP>
        <LegalP>
          En producción, TERRA debe desplegarse con HTTPS. La configuración concreta de TLS,
          registros y monitoreo corresponde al entorno institucional.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Derechos de los titulares',
    body: (
      <>
        <LegalP>
          Los titulares pueden solicitar información, acceso, rectificación, actualización o
          eliminación conforme al marco aplicable. El procedimiento, los plazos y los canales
          oficiales están pendientes de confirmación institucional.
        </LegalP>
        <LegalP>
          Mientras no exista un canal aprobado, las solicitudes deben dirigirse a la autoridad
          institucional competente definida por la institución.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Contacto institucional',
    body: (
      <>
        <LegalSubheading>Datos pendientes de confirmación</LegalSubheading>
        <LegalP>
          La institución debe definir el responsable del tratamiento, domicilio, correo oficial,
          delegado de protección de datos —si corresponde— y procedimiento de atención.
        </LegalP>
        <LegalNote title="Borrador informativo">
          Este documento no constituye asesoría jurídica ni una política oficial aprobada.
        </LegalNote>
      </>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Política de privacidad"
      intro="Borrador informativo sobre qué datos trata TERRA, con qué finalidad, cómo se protegen y qué controles aplican a trabajadores y cuentas administrativas."
      sections={sections}
      currentPath="/politica-de-privacidad"
    />
  )
}
