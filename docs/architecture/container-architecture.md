# Arquitectura de contenedores (desarrollo local)

## Servicios

```yaml
web:    # Vite dev server + React
api:    # Go, REST + SSE
worker: # Go, mismo backend, proceso independiente
db:     # PostgreSQL 18
```

No hay Nginx, Traefik, broker, scheduler, contenedor de migraciones ni servicios
adicionales.

## Imágenes

| Servicio | Imagen | Construcción |
|---|---|---|
| web | `terra-web:local` | `frontend/Dockerfile` |
| api / worker | `terra-backend:local` | `backend/Dockerfile` |
| db | `postgres:18-alpine` | imagen fijada, no se reconstruye |

Los Dockerfiles incluyen las herramientas de desarrollo: Go en backend y Node,
Vite, Vitest, Playwright y Chromium en web.

## Redes y puertos

| Servicio | Puerto interno | Publicado |
|---|---|---|
| web | 5173 | `${WEB_PORT:-8080}:5173` |
| api | 8080 | No |
| worker | — | No |
| db | 5432 | `127.0.0.1:${DB_PORT:-5432}:5432` |

Vite proxy:

```js
'/api': { target: 'http://api:8080' }
```

Esto cubre REST y SSE. Los contenedores se comunican por nombre de servicio
(`db`, `api`); nunca por `localhost`.

## Montajes

| Recurso | Tipo | Uso |
|---|---|---|
| `terra_terra-db` | volumen | PostgreSQL |
| `/app/node_modules` | volumen anónimo | dependencias del frontend |
| `../backend:/src` | bind | source Go |
| `../frontend:/app` | bind | source React + HMR |
| `../data/dev:/var/lib/terra` | bind | documentos: api ro, worker rw |
| `../.cache/go-mod`, `../.cache/go-build` | bind | cachés Go |

`web` y `db` no montan documentos. `.git` no se monta en ningún servicio.

## Healthchecks

- db: `pg_isready`.
- api: `GET /api/v1/health`.
- worker: proceso vivo (`kill -0 1`).
- web: `GET /` en Vite.

## Orden de arranque

`./terra init`: db healthy → api healthy (migraciones) → bootstrap → worker/web.
El worker también puede aplicar migraciones con advisory lock, pero el flujo oficial
las aplica desde api.

## Persistencia

- Detener o eliminar contenedores no elimina el volumen PostgreSQL ni `data/dev`.
- `./terra down --remove` no usa `-v`.
- La recuperación tras eliminar contenedores está probada.
