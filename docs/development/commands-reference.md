# Referencia de comandos

Fuente canónica de comandos de TERRA. Todos los scripts resuelven la raíz del
repositorio y se ejecutan dentro de Docker; no requieren Go, Node ni PostgreSQL
en el host. `./terra` delega en `deploy/scripts/`.

## 1. Requisitos y comprobaciones iniciales

```bash
docker version
docker compose version
./terra help
./terra check
./terra doctor
./terra status
```

- `check` valida Docker, Compose y `.env` antes de operar.
- `doctor` diagnostica contenedores, PostgreSQL, migraciones, API, Vite,
  volúmenes, almacenamiento, backups y errores recientes.
- `status` muestra servicios, salud, puertos, volúmenes y estado de la base.

## 2. Configuración `.env`

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32      # SESSION_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
```

`.env.example` es la referencia de variables. Nunca versione `.env`. Los cambios
de variables requieren recrear el servicio correspondiente; `restart` no recarga
`.env`. Consulte la guía de
[Google Cloud, OAuth 2.0 y Google Drive](../integrations/google-cloud-drive-oauth.md).

## 3. Instalación e inicialización

```bash
./terra init
./terra init --rebuild
./terra init --rebuild --no-cache
./terra init --allow-empty-db
```

`init` crea rutas externas, construye imágenes si faltan, inicia PostgreSQL,
aplica migraciones, ejecuta el bootstrap del administrador y verifica los cuatro
servicios. Nunca elimina volúmenes.

```bash
./terra bootstrap
```

El bootstrap es idempotente y no sobrescribe credenciales existentes.

## 4. Arranque y detención

```bash
./terra up
./terra up --build
./terra down
./terra down --remove        # elimina contenedores y red; conserva volúmenes
./terra restart              # reinicio excepcional de todos
./terra restart api          # reinicio excepcional de uno
```

`up` reconstruye la imagen web con caché antes de iniciar o recrear web, para mantener
sincronizadas las dependencias de `package.json` y `package-lock.json`. `restart` solo
reinicia procesos: no recarga `.env` ni actualiza dependencias. `down` nunca usa `-v`.

## 5. Construcción de imágenes

```bash
./terra build
./terra build --no-cache
./terra build web
./terra build api
```

API y worker comparten la imagen `terra-backend:local`. PostgreSQL usa
`postgres:18-alpine` fijado y no se reconstruye.

## 6. Recarga automática y recreación

| Cambio | Operación |
|---|---|
| Código Go o SQL | Automático con Air; consulte `./terra logs api` o `worker`. |
| `.env` o secretos | `./terra up --recreate=api` y `./terra up --recreate=worker`. |
| Dockerfile o dependencia nativa | `./terra build api && ./terra up`. |
| Código React | HMR de Vite; si cambia `package.json`, reconstruya `web`. |

```bash
./terra up --recreate=api
./terra up --recreate=worker
./terra up --recreate=web
./terra up --recreate=db
./terra up --recreate          # todos, conservando volúmenes
```

## 7. Registros y diagnóstico

```bash
./terra logs
./terra logs api
./terra logs worker -f
./terra logs web -n 100
./terra logs db -n 100
./terra status
./terra doctor
```

Los registros no deben contener secretos. No publique trazas con cookies,
tokens ni cuerpos de peticiones sensibles.

## 8. Acceso a contenedores

```bash
./terra shell api
./terra shell worker
./terra shell web
./terra shell db
```

## 9. PostgreSQL y DBeaver

```bash
./terra db
./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"
./terra db -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"
```

Conexión externa:

| Parámetro | Valor |
|---|---|
| Host | `127.0.0.1` |
| Puerto | `DB_PORT` |
| Base | `POSTGRES_DB` |
| Usuario | `POSTGRES_USER` |
| Contraseña | `POSTGRES_PASSWORD` |

La API y el worker usan `db:5432` dentro de la red Docker. PostgreSQL solo
publica en loopback.

## 10. Migraciones

```bash
./terra migrate up
./terra migrate status
./terra migrate version
```

Las migraciones se aplican dentro del contenedor `api` con advisory lock. Una
migración aplicada es inmutable: los cambios se agregan como un archivo
numerado nuevo en `backend/migrations/`.

## 11. Pruebas

```bash
./terra test
./terra test all
./terra test unit
./terra test integration
./terra test backend
./terra test backend unit
./terra test backend integration
./terra test frontend
./terra test frontend unit
./terra test frontend integration
./terra test e2e
```

- `backend unit` ejecuta `go test ./...` y `go vet ./...`.
- `backend integration` crea y destruye la base temporal `terra_test`.
- `frontend` ejecuta lint, unitarias, integración, build y cobertura.
- `all` incluye backend, frontend y E2E.
- Resultados y cobertura en `artifacts/`.

## 12. Cobertura y lint

```bash
./terra test backend unit
./terra test frontend unit
./terra test frontend integration
./terra test frontend
```

`frontend` genera `artifacts/coverage/frontend`. Las pruebas de backend dejan
`artifacts/coverage/backend-unit.out` y `backend-integration.out`. El lint se
ejecuta con `npm run lint` dentro de `web`.

## 13. Copias de seguridad y restauración

```bash
./terra backup
./terra backup --no-verify
./terra restore
./terra restore <timestamp>
./terra restore <timestamp> --db
./terra restore <timestamp> --storage
./terra restore /ruta/absoluta/del/backup
```

Las copias se guardan en `BACKUP_HOST_PATH/<timestamp>/` con dump, almacenamiento,
metadatos y checksums. `restore` es destructivo y exige confirmación.
`TOKEN_ENCRYPTION_KEY` se respalda por separado.

Verificación y consistencia:

```bash
./deploy/scripts/verify-backup.sh
./deploy/scripts/verify-backup.sh /ruta/absoluta/del/backup
./deploy/scripts/consistency-check.sh
```

## 14. Migración de almacenamiento

```bash
./terra migrate-data
./terra migrate-data --dry-run
./terra migrate-data --apply
./terra migrate-data --apply --yes
```

Copia datos heredados de `data/dev/` y `backups/` a `STORAGE_HOST_PATH` y
`BACKUP_HOST_PATH`, verifica y actualiza `.env`. Nunca elimina el origen.

Retención de snapshots:

```bash
./deploy/scripts/retention.sh
./deploy/scripts/retention.sh --apply
```

Sin `--apply` solo simula. `RETENTION_DAYS=0` desactiva la retención.

## 15. Recuperación de problemas

1. `./terra doctor`.
2. `./terra status`.
3. `./terra logs api -n 300` y `./terra logs worker -n 300`.
4. `./terra check`.
5. `./terra up` para recrear contenedores eliminados sin borrar datos.
6. `./terra init` para recuperar el entorno; nunca elimine volúmenes.

Si un cambio Go no aparece, revise la salida de Air en los logs. Si un cambio de
`.env` no aparece, recree el servicio. Para inconsistencias documentales, ejecute
`./deploy/scripts/consistency-check.sh` y restaure una copia verificada si faltan
archivos.

## Códigos de salida

- `0`: éxito.
- `1`: fallo de validación, compilación, servicio o pruebas.
- `2`: argumentos no válidos.
- `3`: acción destructiva no autorizada o cancelada.

## Reglas de seguridad

- Ningún script elimina volúmenes automáticamente.
- Las pruebas usan `terra_test`, nunca la base de desarrollo.
- Las copias de seguridad no se sobrescriben ni viven dentro del repositorio.
- `migrate-data` copia y verifica; no borra el origen.
- Los documentos y backups viven fuera del repositorio.
