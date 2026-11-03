# Configuración

La configuración se centraliza en dos archivos separados:

- `.env` para desarrollo (proyecto Docker `terra`).
- `.env.production` para producción (proyecto Docker `terra-prod`).

Los scripts seleccionan el archivo según el ambiente explícito (`dev`/`prod`). Los valores de
ejemplo no son aptos para producción. Ver `environment-configuration.md`.

## Aplicación

| Variable | Obligatoria | Descripción |
|---|---|---|
| `APP_ENV` | sí | `development` o `production` |
| `APP_PUBLIC_URL` | sí | URL pública sin slash final; HTTPS en producción |
| `API_INTERNAL_URL` | no | URL interna (referencia) |
| `SESSION_COOKIE_NAME` | no | Default `terra_session` |
| `SESSION_TTL_HOURS` | no | Default 12 |
| `SESSION_SECRET` | sí | ≥32 caracteres; hash de IP de auditoría |
| `TOKEN_ENCRYPTION_KEY` | sí | base64 de 32 bytes; cifra refresh tokens |

## PostgreSQL

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | sí | DSN usado por API, worker y bootstrap |
| `POSTGRES_DB` | sí | Nombre de base |
| `POSTGRES_USER` | sí | Usuario |
| `POSTGRES_PASSWORD` | sí | Contraseña |

## Google

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GOOGLE_CLIENT_ID` | sí | Cliente OAuth External |
| `GOOGLE_CLIENT_SECRET` | sí | Secreto del cliente |
| `GOOGLE_REDIRECT_URL` | sí | Callback de login exacto |
| `GOOGLE_DRIVE_REDIRECT_URL` | sí | Callback de Drive exacto |
| `GOOGLE_DRIVE_SCOPES` | no | Default `https://www.googleapis.com/auth/drive.readonly` |

## Turnstile

| Variable | Obligatoria | Descripción |
|---|---|---|
| `TURNSTILE_SITE_KEY` | sí (prod) | Clave pública; se compila en el SPA |
| `TURNSTILE_SECRET_KEY` | sí (prod) | Secreto Siteverify |
| `TURNSTILE_HOSTNAME` | recomendado | Hostname esperado en Siteverify |
| `TURNSTILE_ACTION` | recomendado | Default `admin_login` |
| `TURNSTILE_VERIFY_URL` | no | Default endpoint oficial Siteverify |

## Almacenamiento

| Variable | Obligatoria | Descripción |
|---|---|---|
| `STORAGE_ROOT` | sí | Ruta **dentro** del contenedor (`/var/lib/terra`) |
| `STORAGE_HOST_PATH` | sí en dev | Ruta del host montada en dev (relativa a `deploy/` si no es absoluta) |
| `STORAGE_HOST_PATH_PROD` | sí en prod | Ruta absoluta del host en producción |
| `WEB_PORT` | no | Puerto local publicado del frontend (default 8080) |
| `DB_PORT` | no | Puerto local de PostgreSQL solo en dev (default 5432) |

## Descargas y worker

| Variable | Default | Descripción |
|---|---|---|
| `DOWNLOAD_MIN_INTERVAL_MS` | 1500 | Separación mínima entre inicios por conexión |
| `WORKER_CONCURRENCY` | 3 | Concurrencia global por trabajo |
| `WORKER_PER_ACCOUNT_CONCURRENCY` | 2 | Concurrencia por cuenta |
| `WORKER_LEASE_SECONDS` | 180 | Vigencia del lease |
| `WORKER_HEARTBEAT_SECONDS` | 10 | Frecuencia de heartbeat |

## Capacidad

| Variable | Descripción |
|---|---|
| `MAX_DOWNLOAD_BYTES` | Tamaño máximo por archivo |
| `MAX_JOB_BYTES` | Tamaño máximo por trabajo |
| `MAX_USER_STORAGE_BYTES` | Almacenamiento por trabajador |
| `MAX_AREA_STORAGE_BYTES` | Almacenamiento por área |
| `MAX_ACTIVE_JOBS_GLOBAL` | Trabajos activos simultáneos globales |
| `MAX_ACTIVE_JOBS_PER_USER` | Trabajos activos por trabajador |
| `MIN_FREE_DISK_BYTES` | Espacio libre mínimo antes de continuar |
| `RETENTION_DAYS` | `0` desactiva retención; se aplica con script explícito |

**Los valores definitivos deben ser aprobados por la institución.** No representan cuotas de
Google ni límites universales.

## Bootstrap

| Variable | Descripción |
|---|---|
| `BOOTSTRAP_ADMIN_USERNAME` | Usuario del primer administrador |
| `BOOTSTRAP_ADMIN_PASSWORD` | Contraseña temporal (≥12); rotar al primer acceso |

## Notas

- Vite solo expone variables `VITE_*` al navegador. La única usada es la site key pública.
- `APP_ENV=production` exige `https://` y claves Turnstile; si falta algo, el arranque falla.
- Cambiar `TOKEN_ENCRYPTION_KEY` sin re-cifrar inutiliza los refresh tokens existentes.
- Cambiar redirect URIs requiere actualizarlas en Google Cloud y en el archivo del ambiente, y recrear la API.
- Cambios en `TURNSTILE_SITE_KEY` requieren reconstruir la imagen web.
- Los scripts validan el archivo correcto y no mezclan dev/prod.
