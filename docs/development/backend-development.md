# Desarrollo del backend

El backend se ejecuta dentro de los contenedores `api` y `worker` con la toolchain
de Go incluida. No se requiere Go ni Air en el host.

## Ejecución y recarga automática

`../backend` está montado mediante bind en `/src`. La API y el worker arrancan con
**Air**, fijado en la imagen de desarrollo:

```bash
./terra up
```

| Servicio | Configuración | Proceso |
|---|---|---|
| `api` | `.air.api.toml` | `/tmp/air-api/api` |
| `worker` | `.air.worker.toml` | `/tmp/air-worker/worker` |

Air vigila:

- archivos `.go` de `cmd/api` o `cmd/worker`, según el servicio;
- todo `internal/`;
- migraciones SQL embebidas con `go:embed`;
- `go.mod` y `go.sum`.

Un cambio de código provoca automáticamente:

```text
building...
running...
api_starting version=dev build_time=2026-11-05T16:51:49Z env=development
```

No es necesario ejecutar `./terra restart api` tras editar Go, SQL, rutas, handlers,
servicios, repositorios, middleware, RBAC o validaciones.

Los binarios temporales se generan en `/tmp/air-api` y `/tmp/air-worker`, fuera del
bind mount del repositorio. Los archivos de error se guardan en
`/tmp/air-api-errors.log` y `/tmp/air-worker-errors.log`.

Registros:

```bash
./terra logs api -f
./terra logs worker -f
```

Si Air detecta un error de compilación, lo muestra en los logs, detiene el proceso
anterior y no ejecuta una versión parcial. Al corregir el archivo vuelve a compilar y
arrancar automáticamente.

## Consistencia de datos y configuración

No existe caché en memoria de usuarios, roles, permisos, sesiones, conexiones de Drive,
trabajos, políticas ni metadatos. Cada petición consulta PostgreSQL o Google Drive según
corresponda. El único estado en memoria relevante es el limitador de solicitudes, que es
local al proceso y no contiene datos de negocio.

La configuración de `.env` se carga al arrancar el proceso. Air recompila código, pero no
reinicia el contenedor; para cambiar variables de entorno hay que recrearlo.

## Dependencias Go

Las dependencias se resuelven dentro de Docker y se guardan en la caché montada:

```bash
./terra shell api
go get <módulo>
go mod tidy
```

Air detecta `go.mod`/`go.sum` y recompila. Si la dependencia necesita una librería del
sistema operativo, añádala al `Dockerfile` y reconstruya la imagen.

## Cambios que requieren otra operación

| Cambio | Operación |
|---|---|
| Código Go, SQL embebido, `go.mod`/`go.sum` | Automático con Air |
| Dependencia que necesita una librería del sistema | `./terra build api && ./terra up` |
| `backend/Dockerfile` | `./terra build api && ./terra up` |
| `.env` o secretos | `./terra up --recreate=api` y `./terra up --recreate=worker` |
| `deploy/compose.yaml` | `./terra check` y recrear los servicios afectados |
| Migración de base de datos | `./terra migrate up` (no reinicia la API) |

Para cambios de entorno se requiere recrear el contenedor: Docker inyecta las
variables al crearlo. Un simple reinicio del proceso no recarga `.env`.

```bash
./terra up --recreate=api
./terra up --recreate=worker
```

`./terra restart api` sigue disponible para diagnóstico excepcional, pero no es el
procedimiento habitual tras un cambio de código.

## Pruebas y vet

```bash
./terra test backend unit
./terra test backend integration
./terra test backend
```

Comandos Docker equivalentes:

```bash
docker compose exec -T api go test ./...
docker compose exec -T api go vet ./...
docker compose exec -T api go test -tags=integration ./tests/integration/...
```

El runner de integración crea una base de datos desechable `terra_test` y la elimina
después. Nunca toca la base de datos de desarrollo.

## Comandos dentro de la imagen

La imagen también contiene los comandos de bootstrap y migraciones:

```bash
./terra migrate up
./terra migrate status
./terra bootstrap
```

En desarrollo se ejecutan mediante `go run` dentro del contenedor `api`. No hay un
contenedor de migraciones. En producción se ejecutan desde los binarios compilados de
la imagen.

## Estructura

```text
backend/
├── .air.api.toml
├── .air.worker.toml
├── cmd/{api,worker,bootstrap,migrate}/
├── internal/{auth,users,organization,drive,downloads,storage,admin,audit,platform,server}/
├── migrations/
└── tests/{unit,integration,fixtures,helpers}/
```

Las pruebas unitarias de los paquetes internos viven junto a sus paquetes; el directorio
bajo `tests/unit` está reservado para el comportamiento exportado entre paquetes. Las
pruebas de integración llevan la etiqueta `integration`.

## Cachés de Go

La distribución local monta `.cache/go-mod` y `.cache/go-build` del host en los
contenedores `api`/`worker`. Air reutiliza esas cachés, manteniendo rápidas las
recompilaciones sin instalar Go en el host.

## Shell

```bash
./terra shell api
go test ./...
```

## Imagen de producción

El `backend/Dockerfile` es multi-stage:

- `development`: Go, Air, herramientas de pruebas y código montado.
- `build`: compilación reproducible de binarios.
- `production`: Alpine, binarios, CA, zona horaria y usuario `terra`; sin Go, sin Air
  y sin código fuente.

Construcción de una imagen de producción:

```bash
docker build \
  --target production \
  --build-arg VERSION="$(git rev-parse --short HEAD)" \
  --build-arg BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -t registry.example/terra-backend:"$(git rev-parse --short HEAD)" \
  ./backend
```

La imagen contiene `/app/api`, `/app/worker`, `/app/migrate` y `/app/bootstrap`.
El despliegue sustituye el contenedor con la nueva etiqueta; no usa bind mounts ni Air.

Procedimiento de producción:

1. ejecutar las pruebas en CI y construir la imagen `production`;
2. asignar una etiqueta inmutable (`git rev-parse --short HEAD` o versión de release);
3. publicar la imagen en el registro;
4. actualizar el servicio con la nueva etiqueta;
5. esperar los healthchecks de API y worker;
6. comprobar en los logs `api_starting`/`worker_starting` con `version` y `build_time`;
7. conservar la etiqueta anterior para rollback.

Las migraciones se ejecutan como operación independiente con `/app/migrate`. No se
recrean volúmenes ni se reinicia PostgreSQL para desplegar código.
