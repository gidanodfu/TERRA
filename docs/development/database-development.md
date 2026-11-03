# Database development

PostgreSQL 18 runs in the `db` container with a persistent named volume.

## Access

```bash
./terra db
./terra db -c "SELECT now();"
docker compose exec -T db psql -U terra -d terra
```

Credentials are read from `.env`; they are never printed by scripts.

## Schema

Migrations are embedded in the API image and applied with an advisory lock. See
`docs/architecture/database-design.md`.

```bash
./terra migrate status
./terra migrate version
./terra migrate up
```

## Development data

The development database lives in `terra_terra-db`. It is preserved by
`./terra down` and by `./terra down --remove`.

Never use `docker compose down -v`, `docker volume rm` or
`docker system prune --volumes` to solve a local problem.

## Test database

`./terra test backend integration`:

1. creates the disposable database `terra_test`;
2. applies all migrations;
3. runs integration tests against it;
4. drops `terra_test`.

The development database is not modified. Test fixtures live in
`backend/tests/fixtures` and helpers in `backend/tests/helpers`.

## Common queries

```sql
SELECT status, count(*) FROM download_jobs GROUP BY status;
SELECT count(*) FROM drive_connections WHERE status='reauthorization_required';
SELECT relative_path FROM stored_files ORDER BY created_at DESC LIMIT 10;
SELECT * FROM schema_migrations ORDER BY version;
```

## Consistency

```bash
./terra test backend integration
./deploy/scripts/consistency-check.sh
```

## Reset (only if you accept data loss)

The distribution does not include a reset command. If you intentionally want to
discard local data, stop the stack and remove the volume manually **only after
creating a backup**:

```bash
./terra backup
./terra down
# Deliberate, destructive, development-only action:
# docker volume rm terra_terra-db
```

This is not part of normal operation and is never executed by the scripts.
