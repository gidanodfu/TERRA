# Desarrollo de la base de datos

PostgreSQL 18 se ejecuta en el contenedor `db` con un volumen nombrado persistente.

## Fuente de configuración

Todas las credenciales viven en `.env`:

```dotenv
POSTGRES_DB=terra
POSTGRES_USER=terra
POSTGRES_PASSWORD=
DB_PORT=5432
```

`POSTGRES_*` es la única fuente de verdad. La API y el worker construyen el DSN interno
(`postgres://…@db:5432/…`) desde esas variables, con codificación segura de caracteres
especiales. No es necesario mantener `DATABASE_URL`; si existe en un `.env` antiguo se
ignora y solo se usa como compatibilidad cuando faltan `POSTGRES_*`.

Cambiar cualquiera de esos valores no requiere editar Go, Compose ni scripts.

## Conexión interna (Docker)

```bash
./terra db
./terra db -c "SELECT now();"
```

API y worker usan el host interno `db` y el puerto interno `5432`. Los scripts leen
usuario y base de `.env`; nunca imprimen la contraseña.

## Conexión externa (DBeaver, pgAdmin, DataGrip, psql)

PostgreSQL publica únicamente en loopback:

| Parámetro | Valor |
|---|---|
| Host | `127.0.0.1` |
| Puerto | `DB_PORT` de `.env` |
| Base de datos | `POSTGRES_DB` |
| Usuario | `POSTGRES_USER` |
| Contraseña | `POSTGRES_PASSWORD` |

Compruebe el puerto publicado:

```bash
docker compose -p terra -f deploy/compose.yaml port db 5432
./terra doctor
```

### DBeaver

1. Nueva conexión → PostgreSQL.
2. Host `127.0.0.1` y puerto tomado de `DB_PORT`.
3. Base de datos, usuario y contraseña tomados de `.env`.
4. Si el puerto está ocupado en el host, cambie `DB_PORT` y recree solo la base:

```bash
# editar DB_PORT en .env
./terra up --recreate=db
```

### pgAdmin y DataGrip

Usan los mismos cinco parámetros. No hace falta publicar el puerto en `0.0.0.0` ni
exponer PostgreSQL fuera del equipo.

### psql externo

Evite escribir la contraseña en el historial; pídala de forma interactiva:

```bash
DB_PORT="$(sed -n 's/^DB_PORT=//p' .env)"
POSTGRES_DB="$(sed -n 's/^POSTGRES_DB=//p' .env)"
POSTGRES_USER="$(sed -n 's/^POSTGRES_USER=//p' .env)"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Nunca copie `POSTGRES_PASSWORD` a un comando, script, captura, issue o registro.

## Esquema

Las migraciones están embebidas en la imagen de la API y se aplican con un bloqueo
advisory. Ver `docs/architecture/database-design.md`.

```bash
./terra migrate status
./terra migrate version
./terra migrate up
```

## Datos de desarrollo

La base de datos de desarrollo vive en `terra_terra-db`. Se conserva con
`./terra down` y con `./terra down --remove`.

Nunca uses `docker compose down -v`, `docker volume rm` ni
`docker system prune --volumes` para resolver un problema local.

## Base de datos de pruebas

`./terra test backend integration`:

1. crea la base de datos desechable `${POSTGRES_DB}_test`;
2. aplica todas las migraciones;
3. ejecuta las pruebas de integración contra ella;
4. elimina la base temporal.

La base de datos de desarrollo no se modifica. Los fixtures de prueba viven en
`backend/tests/fixtures` y los helpers en `backend/tests/helpers`.

## Consultas habituales

```sql
SELECT status, count(*) FROM download_jobs GROUP BY status;
SELECT count(*) FROM drive_connections WHERE status='reauthorization_required';
SELECT relative_path FROM stored_files ORDER BY created_at DESC LIMIT 10;
SELECT * FROM schema_migrations ORDER BY version;
```

## Consistencia

```bash
./terra test backend integration
./deploy/scripts/consistency-check.sh
```

## Restablecimiento (solo si aceptas pérdida de datos)

La distribución no incluye un comando de restablecimiento. Si quieres descartar
intencionadamente los datos locales, detén el stack y elimina el volumen manualmente
**solo después de crear una copia de seguridad**:

```bash
./terra backup
./terra down
# Acción deliberada, destructiva, solo para desarrollo:
# docker volume rm terra_terra-db
```

Esto no forma parte del funcionamiento normal y los scripts nunca lo ejecutan.
