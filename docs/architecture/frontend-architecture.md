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
| `/app/profile`, `/app/drive`, `/app/jobs`, `/app/security` | trabajador | Panel |
| `/app/documents` | trabajador | Redirección a `/app/jobs` |
| `/app/admin/storage` | autenticado | Redirección a `/app/admin/jobs` |
| `/app/admin` | admin | Dashboard |
| `/app/admin/workers`, `.../organization`, `.../connections` | admin | Gestión |
| `/app/admin/downloads` | admin | Asistente de descarga |
| `/app/admin/jobs`, `.../audit`, `.../policy` | admin | Supervisión |
| `/app/jobs/:id`, `/app/admin/jobs/:id` | propietario/admin | Detalle y tiempo real |

## Layout administrativo y del trabajador

El panel administrativo (`AppLayout` cuando el rol es `admin`) usa dos superficies
sobre un fondo gris azulado: sidebar de 210–232 px (`clamp(210px,17vw,232px)`) y
workspace flexible. El shell mide `100dvh` y `max-w-[1920px]`, con 16 px de margen
exterior: ocupa todo el ancho en 1366–1920 px y se limita en monitores ultrapanorámicos
para no estirar la interfaz sin control. El documento nunca scrollea; el único
propietario del scroll vertical es `admin-scroll` (`overflow-y: auto`, sin barra
visible vía `.admin-scroll-container`). La sidebar es un flex item `min-w-0` para que
los nombres largos no impongan su `min-content`.

La adaptación de contenido usa container queries sobre `main` (`@container`), no solo
breakpoints de viewport: las cuadrículas del dashboard, de las páginas administrativas
y de los módulos del trabajador responden al ancho real del workspace. `PageHeader` pasa
a columna por debajo de 42rem de contenido y los badges de la cabecera aparecen según el
ancho del workspace.

El panel del trabajador comparte el mismo shell que administración (`worker-sidebar`,
`worker-workspace`, `worker-scroll` y `worker-drawer`). Solo cambian la navegación, los
permisos, el título del header y el contenido; el header interno, el scroll propio y la
zona inferior de la sidebar son comunes.

Tablas: `.table-wrap` conserva scroll horizontal interno y `contain: layout` evita que
el ancho de la tabla se propague al documento en Chromium. Formularios: `.input` usa
`min-w-0` para que selects e inputs puedan encogerse dentro de flex/grid. Los modales
son flex column con `max-h-[92dvh]`, cabecera y pie fijos y cuerpo desplazable.

Validado en 320, 360, 375, 390, 430, 480, 640, 768, 820, 900, 960, 1024, 1097, 1180,
1280, 1366, 1440, 1536, 1648, 1707, 1745 y 1920 px, con alturas de 500–1080 px, y a
200 % de zoom (960×540).

## Tema claro y oscuro

El tema se centraliza en `app/ThemeContext.jsx` y se aplica como clase `dark` en
`<html>`. Un script inline en `index.html` resuelve la preferencia antes del primer
render (localStorage `terra-theme`, o `prefers-color-scheme` si no existe) para evitar
parpadeos. `ThemeToggle` es el único control de cambio y aparece junto a «Cerrar
sesión» en las sidebars administrativa y del trabajador; ambos comparten el mismo
estado y la misma clave persistida.

Los tokens semánticos viven en `:root` y `.dark`: fondo `#000000`, texto `#ffffff`,
superficies `#080808`/`#101010`/`#181818`, tarjetas `#101010`, sidebar `#050505`,
cabecera de tabla `#181818`, borde `#262626`, muted `#171717`, muted-foreground
`#a3a3a3`, input `#080808`, borde de input `#5c5c5c` y focus-ring verde `#10b981`.
El borde de input se elevó desde el valor base `#353535` para cumplir contraste no
textual 3:1. El tema claro conserva sus valores blancos y grises actuales.

La escala `slate`, los acentos `brand` y las paletas de estado (`emerald`, `amber`,
`red`, `orange`, `sky`) se reinterpretan bajo `.dark`, de modo que las utilidades
existentes adoptan el tema sin duplicar reglas por página. El shell usa `bg-shell`;
el workspace `bg-surface`; las tarjetas `bg-card`; las cabeceras de tabla
`bg-table-head`; los inputs `bg-input-background`; los modales, tooltips y opciones
`bg-surface-tertiary`. `color-scheme: dark` adapta selects, date pickers y barras
nativas, y Cloudflare Turnstile recibe el tema activo.

### Turnstile

`Turnstile` encapsula el ciclo de vida del widget y expone `reset()` por referencia.
`LoginPage` limpia el token y reinicia el widget después de cualquier intento de
login enviado que falle, de modo que el siguiente envío use un token nuevo. El
backend continúa siendo la autoridad: Siteverify, acción, hostname, credenciales y
límites se validan antes de crear la sesión; el frontend no autoriza nada.

## Sesión y CSRF

- `AuthProvider` consulta `GET /auth/me` al cargar.
- El cliente envía `credentials: 'include'` y el header `X-CSRF-Token` en métodos no seguros,
  leyendo la cookie `terra_csrf` (no HttpOnly) y comparándola con el token de la sesión.
- Nunca se accede al token de sesión ni a tokens de Google desde JavaScript.
- Redirecciones automáticas:
  - sin sesión → `/`
  - `pending_profile` → `/onboarding`
  - `must_rotate_password` → `/app/security`
- `has_local_credentials` controla la visibilidad del formulario de contraseña; no se deduce del rol.
- `must_rotate_password` solo fuerza el aviso y la redirección del primer acceso.

## Componentes de menú y selección

La capa compartida vive en `frontend/src/components/`:

- `dropdown-menu.jsx`: shell Radix para menús de acciones.
- `select.jsx`: selector de opciones Radix para formularios y filtros.
- `ui.jsx`: reexporta `Select` y mantiene el resto del sistema de diseño.

Reglas:

1. Un menú de acciones usa `DropdownMenu` y puede incluir etiquetas, separadores,
   iconos, elementos deshabilitados y acciones destructivas. La página decide qué
   opciones mostrar según `useAuth().can()`.
2. Un formulario o filtro usa `Select` con `value`, `onValueChange` y opciones.
   El valor vacío se conserva como `''`; internamente se usa un centinela que nunca
   llega a la API.
3. Un panel de contenido informativo conserva `details/summary` y las clases
   `disclosure`, `disclosure-summary` y `disclosure-body`.
4. Los paneles Radix se renderizan en portal y usan los tokens de superficie,
   borde, sombra y foco existentes. No se definen colores por rol ni por tema.
5. Los componentes son agnósticos al RBAC; las páginas filtran acciones con los
   permisos ya existentes.

## Tiempo real

`RealtimeProvider` mantiene una única conexión WebSocket por sesión. Los componentes se
suscriben a `job:{uuid}` o `admin.dashboard` y se desuscriben al desmontar. Ante error se
reconecta con backoff y jitter, reenvía suscripciones y recibe un snapshot persistido.
`JobDetailPage` usa `useJobEvents`, la lista de trabajos actualiza solo las filas afectadas y
el dashboard recibe snapshots del canal administrativo. REST sigue siendo la carga inicial y
el respaldo; WebSocket no es autoridad.

## Autorización de UI

- El menú y las acciones se construyen desde los permisos devueltos por `/auth/me`.
- `PermissionOnly` muestra acceso no autorizado en rutas administrativas sin el permiso requerido.
- El módulo Trabajadores separa las pestañas de trabajadores y cuentas administrativas.
- La creación y el cambio de estado de cuentas administrativas dependen de permisos explícitos.
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
contenedor. Compose publica `${WEB_PORT:-8080}` y Vite hace proxy de `/api` (REST y WebSocket Upgrade) a `http://api:8080`. No se usa Nginx en esta distribución local.

`npm run build` se usa únicamente para validar la compilación y en pruebas; el
artefacto se escribe en `/tmp` para no ensuciar el host.

La única variable expuesta es `VITE_TURNSTILE_SITE_KEY` (clave pública del widget).
Ningún secreto usa prefijo `VITE_`.
