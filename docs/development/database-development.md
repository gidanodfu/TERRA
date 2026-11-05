# Desarrollo de la base de datos

PostgreSQL 18 se ejecuta en el contenedor `db` con un volumen nombrado persistente.

## Acceso

```bash
./terra db
./terra db -c "SELECT now();"
docker compose exec -T db psql -U terra -d terra
```

Las credenciales se leen de `.env`; los scripts nunca las imprimen.

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

1. crea la base de datos desechable `terra_test`;
2. aplica todas las migraciones;
3. ejecuta las pruebas de integración contra ella;
4. elimina `terra_test`.

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
