# Operación diaria

Todos los scripts resuelven la raíz del repositorio y pueden ejecutarse desde cualquier
directorio. El ambiente es siempre explícito: `dev` o `prod`.

## Encender

```bash
./deploy/scripts/up.sh dev
```

Si las imágenes cambiaron:

```bash
./deploy/scripts/up.sh dev --build
```

## Detener

```bash
./deploy/scripts/down.sh dev
```

Conserva contenedores, volúmenes y documentos. Para eliminar contenedores y red:

```bash
./deploy/scripts/down.sh dev --remove
```

Esto **no** elimina volúmenes ni documentos.

## Estado

```bash
./deploy/scripts/status.sh dev
```

Muestra servicios, healthchecks, imágenes, puertos, redes, volúmenes, espacio, PostgreSQL,
API y heartbeat del worker.

## Logs

```bash
./deploy/scripts/logs.sh dev
./deploy/scripts/logs.sh dev api
./deploy/scripts/logs.sh dev worker
./deploy/scripts/logs.sh dev db
./deploy/scripts/logs.sh dev web
./deploy/scripts/logs.sh dev api -f
./deploy/scripts/logs.sh dev api -n 500
```

## Reiniciar

```bash
./deploy/scripts/restart.sh dev
./deploy/scripts/restart.sh dev api
./deploy/scripts/restart.sh dev worker
./deploy/scripts/restart.sh dev db
```

Verifica el healthcheck al finalizar.

## Reconstruir frontend o backend

```bash
# Todo
./deploy/scripts/build.sh dev

# Solo frontend
./deploy/scripts/build.sh dev web

# Solo backend (API + worker)
./deploy/scripts/build.sh dev api worker

# Sin caché
./deploy/scripts/build.sh dev --no-cache
```

Después:

```bash
./deploy/scripts/up.sh dev
```

## Migraciones

```bash
./deploy/scripts/migrate.sh dev status
./deploy/scripts/migrate.sh dev version
./deploy/scripts/migrate.sh dev up
```

No hay rollback automático. Ver [migrations.md](migrations.md).

## Bootstrap

```bash
./deploy/scripts/bootstrap.sh dev
```

Idempotente: no duplica administradores ni sobrescribe contraseñas.

## Pruebas

```bash
./deploy/scripts/test.sh dev unit
./deploy/scripts/test.sh dev integration
./deploy/scripts/test.sh dev e2e
./deploy/scripts/test.sh dev all
```

Resultados en `artifacts/tests/`.

## Consultar almacenamiento

```bash
./deploy/scripts/status.sh dev
./deploy/scripts/consistency-check.sh dev
```

## Respaldar

```bash
./deploy/scripts/backup.sh dev
./deploy/scripts/verify-backup.sh backups/dev/<timestamp>
```

## Actualizar

```bash
./deploy/scripts/backup.sh dev
git pull
./deploy/scripts/build.sh dev
./deploy/scripts/up.sh dev
./deploy/scripts/status.sh dev
```

## Recuperar contenedores eliminados

```bash
./deploy/scripts/init.sh dev
# o, si también se requiere reconstruir imágenes:
./deploy/scripts/init.sh dev --rebuild
```

Los volúmenes se reutilizan; no se necesita volver a crear usuarios ni descargar documentos.

## Producción

Reemplace `dev` por `prod` y asegúrese de que exista `.env.production`. No ejecute scripts de
desarrollo sobre el proyecto de producción (`terra-prod`).
