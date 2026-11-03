# Arquitectura Docker operativa

## Servicios

| Servicio | Imagen | Comando | Usuario | Función |
|---|---|---|---|---|
| `web` | `${proyecto}-web` | Nginx | `nginx` | SPA + proxy `/api` y SSE |
| `api` | `${proyecto}-api` | `/app/api` | 10001 | REST, OAuth, SSE y acceso a documentos |
| `worker` | `${proyecto}-worker` | `/app/worker` | 10001 | Cola, Drive, transferencias |
| `db` | `postgres:18-alpine` | PostgreSQL | `postgres` | Fuente de verdad y cola |

`api` y `worker` usan la misma imagen backend y comandos distintos. No hay contenedor de
migraciones, broker, Redis ni Nginx separado.

## Proyectos e imágenes

| Ambiente | Proyecto | Imágenes | Volumen PostgreSQL |
|---|---|---|---|
| dev | `terra` | `terra-web`, `terra-api`, `terra-worker` | `terra_terra-db` |
| prod | `terra-prod` | `terra-prod-web`, ... | `terra-prod_terra-db` |

Esto evita que desarrollo y producción compartan imágenes, red o base de datos.

## Construcción

- **Frontend:** contexto raíz `..`, Dockerfile `frontend/Dockerfile`; copia
  `deploy/nginx/nginx.conf` y `deploy/nginx/conf.d/`.
- **Backend:** contexto `../backend`; multi-stage con Go 1.27; produce `api`, `worker`,
  `bootstrap` y `migrate`.
- **PostgreSQL:** imagen fijada `postgres:18-alpine`, no se reconstruye.

BuildKit está activo en `build.sh` (`DOCKER_BUILDKIT=1`). `--pull` actualiza bases;
`--no-cache` reconstruye desde cero.

## Nginx

- Escucha en `8080` dentro del contenedor.
- Sirve `/usr/share/nginx/html`.
- Proxy `/api/` a `http://api:8080` con buffering desactivado y timeouts largos para SSE.
- Cabeceras CSP, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy.
- Configuración versionada en `deploy/nginx/nginx.conf` + `deploy/nginx/conf.d/terra.conf`.

## Redes y puertos

- Red bridge `${proyecto}_terra`.
- `db` no publica puertos en producción.
- En desarrollo, `db` se publica solo en `127.0.0.1:${DB_PORT:-5432}`.
- `api` y `worker` no publican puertos.
- `web` publica `${WEB_PORT:-8080}:8080`.

## Volúmenes

| Recurso | Tipo | Montaje | Modo |
|---|---|---|---|
| PostgreSQL | volumen Docker `${proyecto}_terra-db` | `/var/lib/postgresql` | r/w |
| Documentos | bind host | `/var/lib/terra` | `api` ro, `worker` rw |

`web` y `db` no montan documentos. La API solo lee; el worker es el único escritor.

## Healthchecks

| Servicio | Prueba | Intervalo |
|---|---|---|
| db | `pg_isready` | 10 s |
| api | `GET /api/v1/health` | 15 s |
| web | `GET /healthz` | 15 s |
| worker | `kill -0 1` | 30 s |

Los scripts esperan el estado `healthy` antes de continuar. `status.sh` muestra el estado real.

## Endurecimiento

- Usuario no root (10001; Nginx user).
- `read_only: true` y `tmpfs /tmp`.
- `no-new-privileges`.
- Límites de memoria.
- Sin secretos en imágenes.
- Sin `.env` en el contexto Docker (`.dockerignore`).

## Datos persistentes

- Detener o eliminar contenedores no elimina volúmenes.
- `down.sh` no usa `-v`.
- `init.sh` reutiliza el volumen existente.
- La recuperación tras eliminar contenedores está probada en desarrollo.
- Si se pierde el volumen, la restauración se hace desde backup, nunca recreando una base vacía
  en producción sin autorización.
