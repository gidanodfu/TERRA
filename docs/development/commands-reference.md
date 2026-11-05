# Referencia de comandos

Todos los scripts resuelven la raíz del repositorio automáticamente y se pueden ejecutar
desde cualquier directorio. `./terra` es la interfaz oficial y delega en `deploy/scripts/`.
Ningún comando requiere Go, Node ni PostgreSQL en el host.

## Interfaz principal

| Comando | Responsabilidad |
|---|---|
| `./terra help` | Referencia de comandos |
| `./terra check` | Validación previa |
| `./terra doctor` | Diagnóstico completo del entorno de ejecución |
| `./terra build [--no-cache] [web|api]` | Construir imágenes locales |
| `./terra init [--rebuild] [--no-cache]` | Primera inicialización o recuperación |
| `./terra up [--build] [--recreate[=servicio]]` | Arranque; `--recreate` aplica configuración nueva |
| `./terra down [--remove]` | Detener; `--remove` conserva los volúmenes |
| `./terra restart [service]` | Reinicio manual excepcional; no recarga `.env` |
| `./terra status` | Contenedores, salud, volúmenes, PostgreSQL, API, Vite |
| `./terra logs [service] [-f] [-n N]` | Registros |
| `./terra shell <service>` | Shell dentro de web/api/worker/db |
| `./terra db [-c "SQL"]` | psql en el contenedor db |
| `./terra migrate <up|status|version>` | Migraciones |
| `./terra bootstrap` | Bootstrap idempotente del administrador |
| `./terra test [suite]` | Suites de pruebas solo con Docker |
| `./terra backup` | Copia de seguridad local de PostgreSQL + documentos |
| `./terra restore [backup-dir]` | Restaurar la copia de seguridad local más reciente o la indicada |

## Scripts

| Script | Operaciones Docker | ¿Modifica datos? |
|---|---|---|
| `check.sh` | `docker info`, configuración de compose | No |
| `doctor.sh` | inspect, compose exec, comprobaciones HTTP | No |
| `build.sh` | `docker compose build` | No |
| `init.sh` | build, up, exec migrate/bootstrap | Crea el esquema de la base de datos/administrador si faltan |
| `up.sh` | compose up, healthchecks | No |
| `down.sh` | compose stop/down | No; nunca `-v` |
| `restart.sh` | compose restart | No |
| `status.sh` | compose ps/inspect, lectura con psql | No |
| `logs.sh` | compose logs | No |
| `shell.sh` | compose exec sh | Depende de los comandos del usuario |
| `db.sh` | compose exec psql | Depende del SQL del usuario |
| `migrate.sh` | compose exec `go run ./cmd/migrate` | Solo el esquema |
| `bootstrap.sh` | compose exec `go run ./cmd/bootstrap` | Crea el administrador si falta |
| `test.sh` | compose exec Go/Vitest/Playwright | Usa la base de datos desechable `terra_test` |
| `backup-local.sh` | pg_dump, tar | Crea `BACKUP_HOST_PATH/<timestamp>/` |
| `restore-local.sh` | pg_restore, tar, compose restart | **Destructivo**, con confirmación; busca en `BACKUP_HOST_PATH` |
| `verify-backup.sh` | checksum/tar/pg_restore | No |
| `migrate-data.sh` | copia de archivos + `.env` atómico | **Copia datos**, no borra el origen |
| `consistency-check.sh` | psql + sistema de archivos | No |
| `retention.sh` | psql + sistema de archivos | Solo con `--apply` |
| `help.sh` | ninguno | No |

## Ejemplos

```bash
./terra build --no-cache
./terra test backend integration
./terra shell worker
./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"
./terra logs api -n 300
CONFIRM=yes ./terra restore 20261103T210000Z
./terra migrate-data --dry-run
./terra migrate-data --apply
```

## Códigos de salida

- `0`: éxito.
- `1`: fallo de validación, compilación, servicio o pruebas.
- `2`: argumentos no válidos.
- `3`: acción destructiva no autorizada o cancelada.

## Reglas de seguridad

- `down.sh` nunca usa `docker compose down -v`.
- Ningún script elimina volúmenes.
- El bootstrap nunca sobrescribe credenciales.
- Las pruebas usan una base de datos desechable `terra_test` y nunca la base de datos de desarrollo.
- Las copias de seguridad nunca se sobrescriben ni se guardan dentro del repositorio.
- `migrate-data.sh` copia y verifica; nunca elimina el origen.
- Air recarga código Go en desarrollo; los cambios de `.env` requieren `./terra up --recreate=servicio`.
