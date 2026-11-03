# Arquitectura de contenedores

## Servicios

```yaml
web:    # React compilado + Nginx (misma imagen)
api:    # Go, REST + SSE, usuario 10001
worker: # Go, mismo binario base, comando /app/worker
db:     # PostgreSQL 18
```

No hay servicios auxiliares, broker, scheduler ni contenedor de migraciones.

## Redes y puertos

| Servicio | Puerto interno | Publicado |
|---|---|---|
| web | 8080 | `8080:8080` en dev; configurable en prod |
| api | 8080 | No |
| worker | — | No |
| db | 5432 | Solo `127.0.0.1` en `compose.dev.yaml`; nunca en prod |

Nginx enruta:

```nginx
location /api/ {
    proxy_pass http://api:8080;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}
```

El backend sirve directamente `/api/v1/...`, sin reescritura de path.

## Persistencia

| Recurso | Montaje | Modo |
|---|---|---|
| `terra-db` | `/var/lib/postgresql` | lectura/escritura |
| Volumen documental | `/var/lib/terra` | `api`: ro; `worker`: rw |

`web` y `db` no montan documentos. La API de solo lectura sigue necesitando que existan
`staging/` y `areas/`; `storage.NewReadOnly` no crea directorios.

## Endurecimiento

- Imágenes multi-stage y Alpine.
- API/worker como UID 10001; Nginx como usuario `nginx`.
- `read_only: true` con `tmpfs /tmp`.
- `no-new-privileges`.
- Límites de memoria.
- Healthchecks:
  - db: `pg_isready`
  - api: `GET /api/v1/health`
  - web: `GET /healthz`
  - worker: proceso vivo (`kill -0 1`)
- Secretos solo por `.env`; nunca dentro de la imagen.

## Orden de arranque

`db` healthy → `api` migra y queda healthy → `worker` y `web` arrancan. El worker también aplica
migraciones con advisory lock, por lo que puede arrancar de forma segura aunque la API se reinicie.

## Volúmenes de desarrollo y producción

- Desarrollo: `data/dev` (bind, usuario de desarrollo).
- Producción: `/srv/terra-data/prod` o `STORAGE_HOST_PATH_PROD`.
- La ruta del host se configura en `.env`; nunca se expone al frontend.
