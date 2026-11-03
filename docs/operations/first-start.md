# Primer arranque

El comando principal es:

```bash
./deploy/scripts/init.sh dev
```

En producción:

```bash
./deploy/scripts/init.sh prod --allow-empty-db
# Automatización: CONFIRM_PROD="INIT PROD" ./deploy/scripts/init.sh prod --allow-empty-db
```

## Secuencia real del script

### Fase 1 — Prevalidación

- Docker y daemon accesibles.
- Compose v2 compatible.
- `.env` o `.env.production` presente.
- Variables obligatorias y claves válidas.
- Dockerfiles, Compose, Nginx y ejemplos presentes.
- Servicios exactamente `web`, `api`, `worker`, `db`.
- Almacenamiento accesible.
- Volumen PostgreSQL existente o ausencia detectada.
- Documentos/backups previos identificados.

### Fase 2 — Construcción

- Construye `web`, `api` y `worker` si faltan o si se usa `--rebuild`/`--no-cache`.
- `api` y `worker` comparten imagen.
- PostgreSQL usa `postgres:18-alpine` fijado.

### Fase 3 — PostgreSQL

- `docker compose up -d db`.
- Espera healthcheck.
- Ejecuta `pg_isready` y una consulta real.
- No continúa si la base no responde.

### Fase 4 — API y migraciones

- Inicia `api`.
- La API aplica migraciones embebidas con advisory lock.
- Ejecuta `/app/migrate` dentro del contenedor API para confirmar.
- Espera healthcheck de API.

### Fase 5 — Bootstrap

- Ejecuta `/app/bootstrap` dentro del contenedor API.
- Crea el administrador solo si no existe.
- No sobrescribe credenciales.
- Verifica que exista al menos un administrador local.
- No crea un quinto contenedor.

### Fase 6 — Worker y web

- Inicia `worker` y `web`.
- Espera healthchecks.
- Verifica permisos de lectura/escritura del volumen.

### Fase 7 — Verificación final

- Cuatro contenedores activos y healthy.
- API `/health` y `/ready` a través de Nginx.
- Frontend servido.
- Migraciones aplicadas.
- Volumen documental disponible.
- Resumen operativo sin secretos.

## Resultado esperado

```text
TERRA INITIALIZATION
Environment: development
Docker: OK
Compose: OK
Database: HEALTHY
API: HEALTHY
Worker: HEALTHY
Web: HEALTHY
Storage: READY
Migrations: APPLIED
Bootstrap: VERIFIED
```

## Si ya existen datos

- **Volumen PostgreSQL existente:** `init.sh` lo reutiliza.
- **Contenedores eliminados:** los recrea sin tocar datos.
- **Volumen eliminado pero documentos/backups presentes:** aborta y pide autorización explícita.
- **Producción sin volumen:** exige `--allow-empty-db` y confirmación `INIT PROD`.

## Si falla

1. El script identifica el servicio y el healthcheck.
2. Muestra el comando de logs correspondiente.
3. No imprime un éxito falso.
4. Los servicios se dejan activos para diagnóstico, salvo que el fallo ocurra antes.

```bash
./deploy/scripts/status.sh dev
./deploy/scripts/logs.sh dev api
./deploy/scripts/logs.sh dev db
```

Nunca borre volúmenes para "arreglar" un arranque. Consulte
[troubleshooting.md](troubleshooting.md) y [backup-restore.md](backup-restore.md).
