# Troubleshooting

## Docker not running

**Identify:** `./terra check` fails at Docker daemon.
**Fix:** start Docker/Desktop and verify `docker info`.
**Verify:** `./terra check`.

## Compose missing

**Identify:** `docker compose version` fails.
**Fix:** install the Compose v2 plugin.
**Verify:** `./terra check`.

## Missing or invalid .env

**Identify:** `./terra check` names the missing variable or file.
**Fix:**

```bash
cp .env.example .env
chmod 600 .env
# complete local values
```

**Verify:** `./terra check`.

## Port occupied

**Identify:** `./terra up` cannot bind 8080 or 5432.
**Fix:** stop the conflicting process or change `WEB_PORT`/`DB_PORT`.
**Verify:** `./terra status`.

## PostgreSQL unhealthy

**Identify:** `db` unhealthy.
**Logs:** `./terra logs db`.
**Fix:** check credentials, disk space and volume compatibility. Do not delete the
volume.
**Verify:** `./terra doctor`.

## API unhealthy

**Identify:** `api` not healthy.
**Logs:** `./terra logs api`.
**Causes:** invalid `.env`, missing storage, database, migration error.
**Fix:** correct the cause, then `./terra up`.
**Verify:** `./terra status` and `/api/v1/ready`.

## Worker not processing

**Identify:** jobs remain queued.
**Logs:** `./terra logs worker`.
**Fix:** verify the worker container, database connectivity and job policy/authorization.
**Verify:** `./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"`.

## Blank page / /@vite/client errors

**Identify:** blank UI; browser requests `/@vite/client` and receives 404 or HTML.
**Cause:** the web container cannot see `node_modules/vite` (stale mount/volume) or a
static server is serving development HTML.
**Diagnose:**

```bash
curl -sS -D - -o /dev/null http://localhost:8080/@vite/client
docker compose exec -T web test -f node_modules/vite/dist/client/client.mjs && echo ok
./terra doctor
```

The response must be `Content-Type: text/javascript`.
**Fix:**

```bash
./terra build web
./terra up
```

`up` force-recreates web so obsolete mounts cannot persist.
**Verify:** `./terra doctor` and `./terra test e2e`.

## Vite not reachable

**Identify:** `http://localhost:8080` fails.
**Logs:** `./terra logs web`.
**Fix:** rebuild web after lockfile changes (`./terra build web`), verify the port and
Vite proxy.
**Verify:** `curl -i http://localhost:8080/api/v1/health`.

## Proxy/API failure

**Identify:** frontend loads but API calls fail.
**Logs:** `./terra logs web api`.
**Fix:** verify API health and `VITE_API_PROXY` target `http://api:8080`.
**Verify:** `./terra doctor`.

## Migration failure

**Identify:** API unhealthy or `./terra migrate up` fails.
**Logs:** `./terra logs api`.
**Fix:** restore a local backup if the schema is inconsistent; add a new migration for
future changes. Do not edit an applied migration.
**Verify:** `./terra migrate status`.

## Tests fail

```bash
./terra test backend unit
./terra test backend integration
./terra test frontend unit
./terra test frontend integration
./terra test e2e
```

Check `artifacts/tests/` and the service logs. Integration tests use a disposable
database; they do not alter development data.

## Playwright/Chromium fails

Chromium is installed in the web image. Rebuild the web image:

```bash
./terra build web --no-cache
./terra up
```

Run `./terra shell web` and then `npm run test:e2e` for details.

## Container removed accidentally

```bash
./terra init
```

Volumes and documents remain. Do not create a new empty database if the volume is
missing and documents/backups exist; restore instead.

## Volume missing

**Identify:** `./terra status` shows the volume missing.
**Fix:** check for local backups and restore:

```bash
./terra restore backups/<timestamp>
```

The scripts never remove volumes automatically.

## Insufficient disk

**Fix:** free space or adjust local capacity limits. Do not delete the database.
**Verify:** `./terra status`.

## Logs

```bash
./terra logs
./terra logs api -n 500
./terra logs worker -f
```
