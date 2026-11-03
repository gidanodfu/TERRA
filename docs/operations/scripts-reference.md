# Referencia de scripts

Todos los comandos se ejecutan desde cualquier directorio:

```bash
/path/to/TERRA/deploy/scripts/<script>.sh <dev|prod> [opciones]
```

El ambiente nunca es implícito. `dev` usa `.env` y el proyecto Docker `terra`; `prod` usa
`.env.production` y `terra-prod`. Los scripts se detienen ante errores (`set -Eeuo pipefail`),
validan argumentos y muestran mensajes `[TERRA]`.

## Códigos de salida comunes

| Código | Significado |
|---|---|
| 0 | Operación correcta |
| 1 | Fallo de validación, construcción, servicio o prueba |
| 2 | Uso incorrecto / argumento inválido |
| 3 | Operación destructiva no autorizada o cancelada |

## Tabla comparativa

| Script | Modifica contenedores | Modifica volumen PostgreSQL | Modifica documentos | Destructivo |
|---|---|---|---|---|
| `check.sh` | No | No | No | No |
| `build.sh` | No | No | No | No |
| `init.sh` | Sí (crea/recrea) | No (crea si falta) | Crea directorios | No |
| `up.sh` | Sí (crea/recrea) | No | No | No |
| `down.sh` | Detiene o elimina | No | No | No (sin `-v`) |
| `restart.sh` | Reinicia | No | No | No |
| `status.sh` | No | No | No | No |
| `logs.sh` | No | No | No | No |
| `migrate.sh` | No | Aplica migraciones | No | No |
| `bootstrap.sh` | No | Solo crea admin si falta | No | No |
| `test.sh` | Contenedores efímeros de test | No | No | No |
| `backup.sh` | No | No | No | No |
| `restore.sh` | Detiene/reinicia | **Sí** | **Sí** | **Sí** |
| `consistency-check.sh` | No | No | No | No |
| `retention.sh` | No | Elimina snapshots antiguos | Elimina snapshots antiguos | **Sí con `--apply`** |
| `verify-backup.sh` | Contenedor efímero pg_restore | No | No | No |
| `help.sh` | No | No | No | No |

---

## `check.sh`

- **Responsabilidad:** prevalidar Docker, Compose, archivos, variables, servicios, almacenamiento,
  PostgreSQL (configuración), espacio y backups.
- **Sintaxis:** `check.sh <dev|prod> [--for-init] [-q]`
- **Docker:** `docker info`, `docker compose version`, `docker compose config`.
- **Modifica:** nada. No crea directorios.
- **Riesgos:** ninguno; no imprime valores de `.env`.
- **Códigos:** 0 válido, 1 inválido, 2 uso.
- **Ejemplo:** `./deploy/scripts/check.sh dev`

## `build.sh`

- **Responsabilidad:** construir imágenes web/backend con BuildKit.
- **Sintaxis:** `build.sh <dev|prod> [--no-cache] [--no-pull] [web|api|worker ...]`
- **Docker:** `docker compose build --pull [--no-cache]`.
- **Imágenes:** `${proyecto}-web`, `${proyecto}-api`, `${proyecto}-worker`.
- **Modifica:** solo imágenes. No volúmenes, contenedores ni datos.
- **Riesgos:** consumo de disco/red; `--no-cache` tarda más.
- **Códigos:** 0 correcto, 1 fallo, 2 uso.
- **Ejemplo:** `./deploy/scripts/build.sh dev --no-cache`

## `init.sh`

- **Responsabilidad:** primera instalación o recuperación completa; construye si hace falta,
  crea/recrea contenedores, inicia PostgreSQL, aplica migraciones, ejecuta bootstrap y verifica.
- **Sintaxis:** `init.sh <dev|prod> [--rebuild] [--no-cache] [--allow-empty-db]`
- **Docker:** `compose build`, `up -d db`, `up -d api`, `exec api /app/migrate`,
  `exec api /app/bootstrap`, `up -d worker web`, healthchecks.
- **Modifica:** contenedores; crea el volumen PostgreSQL si no existe; crea directorios técnicos.
- **Conserva:** volúmenes y documentos existentes. **No ejecuta `down -v`.**
- **Riesgos:** crear una base vacía cuando faltan datos. Por eso exige autorización si detecta
  documentos/backups, y en producción exige `--allow-empty-db` + `INIT PROD`.
- **Códigos:** 0 correcto, 1 fallo, 2 uso, 3 autorización requerida.
- **Ejemplo:** `./deploy/scripts/init.sh dev --rebuild`
- **Producción no interactiva:** `CONFIRM_PROD="INIT PROD" ./deploy/scripts/init.sh prod --allow-empty-db`

## `up.sh`

- **Responsabilidad:** arranque habitual.
- **Sintaxis:** `up.sh <dev|prod> [--build]`
- **Docker:** `compose up -d`, healthchecks.
- **Modifica:** contenedores. **No** ejecuta bootstrap, no reinicializa la base y no borra datos.
- **Condición:** exige que exista el volumen PostgreSQL; si no, indica usar `init.sh`.
- **Códigos:** 0 correcto, 1 fallo, 2 uso, 3 requiere inicialización.
- **Ejemplo:** `./deploy/scripts/up.sh dev`

## `down.sh`

- **Responsabilidad:** detener de forma segura.
- **Sintaxis:** `down.sh <dev|prod> [--remove]`
- **Docker:** `compose stop` o `compose down` (sin `-v`).
- **Modifica:** contenedores/red con `--remove`.
- **Conserva:** volúmenes, PostgreSQL y documentos.
- **Riesgos:** ninguno sobre datos. `--remove` no es una pérdida de datos.
- **Códigos:** 0 correcto, 1 fallo, 2 uso.
- **Ejemplo:** `./deploy/scripts/down.sh dev --remove`

## `restart.sh`

- **Responsabilidad:** reiniciar todo o un servicio.
- **Sintaxis:** `restart.sh <dev|prod> [web|api|worker|db]`
- **Docker:** `compose restart [servicio]`, healthchecks.
- **Modifica:** procesos de contenedores. No volúmenes ni datos.
- **Códigos:** 0 correcto, 1 fallo, 2 uso.
- **Ejemplo:** `./deploy/scripts/restart.sh dev api`

## `status.sh`

- **Responsabilidad:** estado operativo completo.
- **Sintaxis:** `status.sh <dev|prod>`
- **Docker:** `compose ps`, `docker inspect`, `docker network/volume ls`.
- **Modifica:** nada.
- **Códigos:** 0 consulta realizada, 1 error de infraestructura, 2 uso.
- **Ejemplo:** `./deploy/scripts/status.sh dev`

## `logs.sh`

- **Responsabilidad:** logs de todos o un servicio.
- **Sintaxis:** `logs.sh <dev|prod> [servicio] [-f|--follow] [-n|--lines N]`
- **Docker:** `compose logs --no-color --tail N [-f]`.
- **Modifica:** nada. Los logs de TERRA no contienen secretos.
- **Códigos:** 0 correcto, 1 fallo, 2 uso.
- **Ejemplo:** `./deploy/scripts/logs.sh dev worker -f`

## `migrate.sh`

- **Responsabilidad:** aplicar/consultar migraciones.
- **Sintaxis:** `migrate.sh <dev|prod> <up|status|version>`
- **Docker:** `compose exec api /app/migrate`; consultas `psql` en `db`.
- **Modifica:** esquema de PostgreSQL solo con `up`.
- **No hace:** rollback automático ni crea contenedores de migración.
- **Códigos:** 0 correcto, 1 fallo, 2 uso.
- **Ejemplos:**
  - `./deploy/scripts/migrate.sh dev status`
  - `./deploy/scripts/migrate.sh dev up`

## `bootstrap.sh`

- **Responsabilidad:** bootstrap administrativo idempotente.
- **Sintaxis:** `bootstrap.sh <dev|prod>`
- **Docker:** `compose exec api /app/bootstrap`.
- **Modifica:** crea el primer administrador solo si no existe.
- **Conserva:** contraseñas y datos existentes.
- **Códigos:** 0 correcto, 1 fallo, 2 uso.
- **Ejemplo:** `./deploy/scripts/bootstrap.sh dev`

## `test.sh`

- **Responsabilidad:** unitarias, integración y E2E HTTP.
- **Sintaxis:** `test.sh <dev|prod> <unit|integration|e2e|all>`
- **Docker:** `docker run --rm` con `golang:1.27-alpine` y `node:24-alpine` para unitarias;
  los servicios Compose existentes para integración/E2E.
- **Modifica:** solo `artifacts/tests/` y cachés efímeras. No datos.
- **Códigos:** 0 correcto, 1 prueba fallida, 2 uso.
- **Ejemplos:** `./deploy/scripts/test.sh dev all`

## `backup.sh`

- **Responsabilidad:** backup coordinado.
- **Sintaxis:** `backup.sh <dev|prod> [--no-verify]`
- **Docker:** `compose exec db pg_dump`; `pg_restore --list` para verificar.
- **Genera:** `backups/<ambiente>/<timestamp>/` con dump, `storage.tar.gz`, `metadata.json`,
  `SHA256SUMS`; cifrado opcional con `BACKUP_GPG_RECIPIENT`.
- **Modifica:** solo crea un directorio nuevo; no sobrescribe.
- **No incluye:** `.env` ni `TOKEN_ENCRYPTION_KEY`.
- **Códigos:** 0 correcto, 1 fallo, 2 uso.
- **Ejemplo:** `./deploy/scripts/backup.sh dev`

## `restore.sh`

- **Responsabilidad:** restaurar PostgreSQL y/o almacenamiento.
- **Sintaxis:** `restore.sh <dev|prod> <backup-dir> [--db|--storage|--all]`
- **Docker:** detiene web/api/worker; `pg_restore`; `tar`; reinicia y verifica.
- **Modifica:** **destructivamente** los componentes elegidos.
- **Conserva:** el backup y los componentes no seleccionados.
- **Confirmación:** `CONFIRM=yes`; producción además `CONFIRM_PROD="RESTORE PROD"`.
- **Códigos:** 0 correcto, 1 fallo, 2 uso, 3 cancelado.
- **Ejemplo:** `CONFIRM=yes ./deploy/scripts/restore.sh dev backups/dev/<timestamp> --all`

## `verify-backup.sh`

- **Responsabilidad:** validar checksums, tar y dump sin restaurar.
- **Sintaxis:** `verify-backup.sh <backup-dir>`
- **Docker:** usa `postgres:18-alpine` si `pg_restore` no está local.
- **Modifica:** nada.
- **Códigos:** 0 válido, 1 inválido, 2 uso.

## `consistency-check.sh`

- **Responsabilidad:** comparar `stored_files` con el disco.
- **Sintaxis:** `consistency-check.sh <dev|prod>`
- **Modifica:** nada.
- **Códigos:** 0 consistente, 1 faltan archivos, 2 uso.

## `retention.sh`

- **Responsabilidad:** eliminar snapshots antiguos según `RETENTION_DAYS`.
- **Sintaxis:** `retention.sh <dev|prod> [--apply]`
- **Modifica:** con `--apply` elimina archivos y filas de snapshots elegibles.
- **Seguridad:** dry-run por defecto, confirmación adicional, valida rutas.
- **Códigos:** 0 correcto, 1 fallo, 2 uso, 3 cancelado.

## `help.sh`

- **Responsabilidad:** referencia rápida.
- **Sintaxis:** `help.sh`
- **Modifica:** nada.

## `_common.sh`

Biblioteca interna cargada por los demás scripts. Centraliza rutas, ambientes, Compose,
validaciones, healthchecks, confirmaciones y mensajes. No se ejecuta directamente.

## Variables de entorno de los scripts

| Variable | Uso |
|---|---|
| `TERRA_ENV_FILE` | Ruta alternativa al archivo de ambiente |
| `TERRA_PROJECT` | Nombre de proyecto Docker (por defecto `terra` / `terra-prod`) |
| `WEB_PORT` | Puerto publicado del frontend |
| `DB_PORT` | Puerto local de PostgreSQL solo en dev |
| `TERRA_DOCKER_BIN` | Binario Docker alternativo (pruebas) |
| `CONFIRM=yes` | Confirma operaciones destructivas no productivas |
| `CONFIRM_PROD` | Frase exacta para producción (`INIT PROD` / `RESTORE PROD`) |
| `BACKUP_GPG_RECIPIENT` | Cifra backups con GPG |
| `RETENTION_DAYS` | Días de retención de snapshots |
