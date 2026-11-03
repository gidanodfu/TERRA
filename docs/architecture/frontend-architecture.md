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
| `/app` | trabajador | Inicio |
| `/app/profile`, `/app/drive`, `/app/jobs`, `/app/documents`, `/app/security` | trabajador | Panel |
| `/app/admin` | admin | Dashboard |
| `/app/admin/workers`, `.../organization`, `.../connections` | admin | Gestión |
| `/app/admin/downloads` | admin | Asistente de descarga |
| `/app/admin/jobs`, `.../storage`, `.../audit`, `.../policy` | admin | Supervisión |
| `/app/jobs/:id`, `/app/admin/jobs/:id` | propietario/admin | Detalle y SSE |

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
