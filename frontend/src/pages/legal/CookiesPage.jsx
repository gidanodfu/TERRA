import LegalLayout, {
  LegalList,
  LegalNote,
  LegalP,
  LegalSubheading,
  LegalTable,
} from '../../layouts/LegalLayout'

const sections = [
  {
    title: 'Cookies y almacenamiento del navegador',
    body: (
      <>
        <LegalP>
          Una cookie es un dato que el navegador envía al servidor en las solicitudes al mismo
          sitio. El almacenamiento local del navegador —como <code>localStorage</code>— no es una
          cookie: permanece en el dispositivo, JavaScript puede leerlo y no se envía
          automáticamente al servidor.
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
          head={['Nombre', 'Categoría', 'HttpOnly', 'Finalidad', 'Duración']}
          rows={[
            ['terra_session (valor predeterminado)', 'Sesión', 'Sí', 'Mantener la sesión autenticada del lado del servidor.', '12 horas por defecto, configurable.'],
            ['terra_csrf', 'Seguridad CSRF', 'No', 'Permitir que el frontend envíe el token CSRF que el backend compara con la sesión.', 'La misma que la sesión.'],
            ['terra_oauth_state', 'Estado OAuth', 'Sí', 'Comprobar que la respuesta de Google corresponde al flujo iniciado por TERRA.', '10 minutos (600 segundos).'],
          ]}
        />
        <LegalP>
          El nombre de la cookie de sesión puede configurarse mediante{' '}
          <code>SESSION_COOKIE_NAME</code>. Su duración se configura con{' '}
          <code>SESSION_TTL_HOURS</code>. La cookie CSRF acompaña a la sesión y se utiliza en el
          encabezado <code>X-CSRF-Token</code>.
        </LegalP>
        <LegalP>
          Las tres cookies usan <code>Path=/</code> y <code>SameSite=Lax</code>. En producción se
          marcan como <code>Secure</code>, por lo que el navegador solo las envía por HTTPS.
        </LegalP>
        <LegalP>
          La cookie de sesión no es accesible desde JavaScript. La cookie CSRF sí es legible para
          que el cliente pueda enviar el token; no contiene contraseñas ni tokens de Google. La
          cookie de estado OAuth es independiente de la sesión autenticada y se utiliza tanto en el
          acceso de trabajadores como en la autorización de Google Drive.
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
          la preferencia de tema claro u oscuro. No es una cookie, no se envía en las solicitudes
          HTTP y no identifica al usuario.
        </LegalP>
        <LegalP>
          Si se elimina esta clave, se pierde la preferencia persistida del tema. La sesión
          autenticada depende de sus cookies, no de este almacenamiento.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Integraciones externas',
    body: (
      <>
        <LegalSubheading>Google OAuth y Google Drive</LegalSubheading>
        <LegalP>
          TERRA inicia flujos de autorización hacia Google para el acceso de trabajadores y para la
          conexión de Google Drive. La interacción ocurre en dominios de Google y está sujeta a sus
          propias políticas de privacidad y cookies.
        </LegalP>
        <LegalSubheading>Cloudflare Turnstile</LegalSubheading>
        <LegalP>
          El acceso administrativo utiliza Cloudflare Turnstile como verificación de seguridad. El
          widget y la validación se ejecutan con servicios de Cloudflare, sujetos a sus propias
          políticas.
        </LegalP>
        <LegalP>
          TERRA no atribuye nombres de cookies a estos proveedores ni afirma que utilicen una cookie
          concreta. Cualquier inventario detallado de cookies de terceros requiere una revisión de
          red y de la documentación oficial de cada proveedor.
        </LegalP>
      </>
    ),
  },
  {
    title: 'Finalidad y efectos de bloquearlas',
    body: (
      <>
        <LegalList items={[
          'Sin la cookie de sesión no puede mantenerse el acceso autenticado.',
          'La ausencia o alteración de la cookie CSRF provoca el rechazo de solicitudes protegidas que requieran validación CSRF.',
          'La ausencia de la cookie de estado OAuth puede impedir completar el inicio de sesión con Google o la conexión de Drive.',
          'Bloquear localStorage afecta únicamente la persistencia del tema; no equivale a bloquear cookies ni cierra la sesión.',
        ]} />
        <LegalNote title="Marco aplicable pendiente">
          La institución debe validar las bases jurídicas, exenciones y requisitos de consentimiento
          aplicables antes de aprobar esta política. TERRA no implementa un banner de consentimiento
          en esta versión.
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
