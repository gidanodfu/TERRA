import LegalLayout, {
  LegalNote,
  LegalP,
  LegalTable,
} from '../../layouts/LegalLayout'

const sections = [
  {
    title: 'Cookies y almacenamiento del navegador',
    body: (
      <>
        <LegalP>
          Una cookie es un dato que el navegador envía al servidor en cada solicitud al mismo sitio.
          El almacenamiento local del navegador —como <code>localStorage</code>— no es una cookie:
          permanece en el dispositivo y JavaScript puede leerlo.
        </LegalP>
        <LegalP>
          TERRA no implementa cookies publicitarias ni herramientas de analítica propias.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Cookies propias de TERRA',
    body: (
      <>
        <LegalTable
          head={['Nombre', 'Tipo', 'Finalidad', 'Duración']}
          rows={[
            ['terra_session (o SESSION_COOKIE_NAME)', 'Cookie HttpOnly', 'Mantener la sesión autenticada del lado del servidor.', 'SESSION_TTL_HOURS; expiración absoluta.'],
            ['terra_csrf', 'Cookie legible por JavaScript', 'Permitir que el SPA envíe el token CSRF que el servidor compara con la sesión.', 'La misma que la sesión.'],
            ['terra_oauth_state', 'Cookie HttpOnly', 'Proteger el estado del flujo OAuth de Google.', '10 minutos.'],
          ]}
        />
        <LegalP>
          La cookie de sesión no es accesible desde JavaScript. La cookie CSRF sí es legible para
          que el cliente pueda enviar el encabezado <code>X-CSRF-Token</code>; no contiene
          credenciales ni tokens de Google.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Almacenamiento local del navegador',
    body: (
      <>
        <LegalP>
          TERRA utiliza la clave <code>terra-theme</code> en <code>localStorage</code> para recordar
          la preferencia de tema claro u oscuro. No es una cookie, no se envía al servidor y no
          identifica al usuario.
        </LegalP>
        <LegalP>
          Borrar el almacenamiento local restablece la preferencia de tema, sin afectar la sesión
          mientras las cookies correspondientes sigan vigentes.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Integraciones de terceros',
    body: (
      <>
        <LegalP>
          El flujo de Google OAuth se ejecuta en dominios de Google. Cloudflare Turnstile protege el
          acceso administrativo. Estos proveedores pueden utilizar sus propias cookies o
          almacenamiento técnico en sus dominios, conforme a sus políticas.
        </LegalP>
        <LegalP>
          TERRA no controla esas cookies de terceros ni las enumera como propias. La institución debe
          revisar la configuración y documentación de cada proveedor antes de publicar esta política.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Finalidad y gestión',
    body: (
      <>
        <LegalP>
          Las cookies propias se utilizan para autenticación, seguridad CSRF y finalización del flujo
          OAuth. El almacenamiento local se utiliza para la preferencia visual.
        </LegalP>
        <LegalP>
          Bloquear las cookies de sesión o CSRF impide iniciar sesión o realizar operaciones
          protegidas. Bloquear el almacenamiento local solo afecta la persistencia del tema.
        </LegalP>
        <LegalNote title="Marco aplicable pendiente">
          La institución debe validar si corresponde un mecanismo de consentimiento y qué base
          jurídica aplica a cada cookie antes de la publicación definitiva.
        </LegalNote>
      </>
    ),
  },
  {
    title: 'Actualizaciones de esta política',
    body: (
      <>
        <LegalP>
          La institución puede actualizar esta política cuando cambien las cookies, el
          almacenamiento o las integraciones de TERRA. La versión vigente será la publicada en esta
          página.
        </LegalP>
        <LegalP>
          Este documento es un borrador técnico y no una política de cookies oficialmente aprobada.
        </LegalP>
      </>
    ),
  },
]

export default function CookiesPage() {
  return (
    <LegalLayout
      title="Política de cookies"
      intro="Borrador informativo sobre las cookies propias de TERRA, el almacenamiento local del navegador y las integraciones externas de Google y Cloudflare."
      sections={sections}
      currentPath="/politica-de-cookies"
    />
  )
}
