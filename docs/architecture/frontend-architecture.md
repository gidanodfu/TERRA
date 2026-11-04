# Arquitectura del frontend

## Estructura

```
frontend/src/
├── app/            # App, rutas, AuthContext
├── pages/          # composición de páginas (worker y admin)
├── features/       # auth, profile, drive, downloads
├── components/     # sistema de diseño compartido
├── layouts/        # shell con navegación responsive
├── services/       # cliente HTTP y CSRF
├── utils/          # formato, estados y progreso
└── styles/         # tokens Tailwind
```

## Rutas

| Ruta | Rol | Componente |
|---|---|---|
| `/` | público | Login (Google + administrador) |
| `/onboarding` | autenticado pendiente | Perfil obligatorio |
| `/politica-de-privacidad` | público | Política de privacidad |
| `/terminos-y-condiciones` | público | Términos y condiciones |
| `/aviso-legal` | público | Aviso legal |
| `/politica-de-cookies` | público | Política de cookies |
| `/Política-*`, `/Términos-*`, etc. | público | Redirección a rutas canónicas |
| `/app` | trabajador | Inicio |
| `/app/profile`, `/app/drive`, `/app/jobs`, `/app/documents`, `/app/security` | trabajador | Panel |
| `/app/admin` | admin | Dashboard |
| `/app/admin/workers`, `.../organization`, `.../connections` | admin | Gestión |
| `/app/admin/downloads` | admin | Asistente de descarga |
| `/app/admin/jobs`, `.../storage`, `.../audit`, `.../policy` | admin | Supervisión |
| `/app/jobs/:id`, `/app/admin/jobs/:id` | propietario/admin | Detalle y SSE |

## Layout administrativo

El panel administrativo (`AppLayout` cuando el rol es `admin`) usa dos superficies
sobre un fondo gris azulado: sidebar de 210–232 px (`clamp(210px,17vw,232px)`) y
workspace flexible. El shell mide `100dvh` y `max-w-[1920px]`, con 16 px de margen
exterior: ocupa todo el ancho en 1366–1920 px y se limita en monitores ultrapanorámicos
para no estirar la interfaz sin control. El documento nunca scrollea; el único
propietario del scroll vertical es `admin-scroll` (`overflow-y: auto`, sin barra
visible vía `.admin-scroll-container`). La sidebar es un flex item `min-w-0` para que
los nombres largos no impongan su `min-content`.

La adaptación de contenido usa container queries sobre `main` (`@container`), no solo
breakpoints de viewport: las cuadrículas del dashboard y de las páginas administrativas
responden al ancho real del workspace. `PageHeader` pasa a columna por debajo de 42rem
de contenido y los badges de la cabecera aparecen según el ancho del workspace. El
panel del trabajador conserva su layout, pero su `main` usa `max-w-[1600px]` y
`@container` para compartir el mismo criterio.

Tablas: `.table-wrap` conserva scroll horizontal interno y `contain: layout` evita que
el ancho de la tabla se propague al documento en Chromium. Formularios: `.input` usa
`min-w-0` para que selects e inputs puedan encogerse dentro de flex/grid. Los modales
son flex column con `max-h-[92dvh]`, cabecera y pie fijos y cuerpo desplazable.

Validado en 320, 360, 375, 390, 430, 480, 640, 768, 820, 900, 960, 1024, 1097, 1180,
1280, 1366, 1440, 1536, 1648, 1707, 1745 y 1920 px, con alturas de 500–1080 px, y a
200 % de zoom (960×540).

## Sesión y CSRF

- `AuthProvider` consulta `GET /auth/me` al cargar.
- El cliente envía `credentials: 'include'` y el header `X-CSRF-Token` en métodos no seguros,
  leyendo la cookie `terra_csrf` (no HttpOnly) y comparándola con el token de la sesión.
- Nunca se accede al token de sesión ni a tokens de Google desde JavaScript.
- Redirecciones automáticas:
  - sin sesión → `/`
  - `pending_profile` → `/onboarding`
  - `must_rotate_password` → `/app/security`

## SSE

`useJobEvents` abre `EventSource` al detalle del trabajo. Escucha `snapshot`, `done` y eventos
de progreso. Ante error, cierra y el detalle hace polling REST cada 5 s. El estado se mezcla con
la fila obtenida por REST; SSE no es autoridad.

## Autorización de UI

- El menú y las acciones se ocultan según rol/permisos.
- `AdminOnly` evita renderizar rutas administrativas a no administradores.
- Ninguna comprobación del navegador sustituye al backend.

## Diseño

- Tailwind CSS 4 con tokens de marca verdes y neutros.
- Tarjetas `rounded-2xl`, formularios consistentes, tablas con scroll horizontal.
- Iconografía Lucide.
- Estados de carga, vacío, error, parcial y completado.
- Navegación lateral fija en escritorio y drawer en móvil.
- `:focus-visible` global y etiquetas accesibles.

## Servidor de desarrollo

`web` ejecuta `vite` como servidor de desarrollo con HMR en el puerto 5173 del
contenedor. Compose publica `${WEB_PORT:-8080}` y Vite hace proxy de `/api` (REST y
SSE) a `http://api:8080`. No se usa Nginx en esta distribución local.

`npm run build` se usa únicamente para validar la compilación y en pruebas; el
artefacto se escribe en `/tmp` para no ensuciar el host.

La única variable expuesta es `VITE_TURNSTILE_SITE_KEY` (clave pública del widget).
Ningún secreto usa prefijo `VITE_`.
