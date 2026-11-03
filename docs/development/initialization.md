# Initialization

## First installation

```bash
cp .env.example .env
chmod 600 .env
# complete the required local values in .env
./terra init
```

`./terra init` is the single entry point. It validates the environment, prepares
local storage, builds missing images, starts PostgreSQL, applies migrations, runs
the administrator bootstrap, starts worker and web, and verifies the four services.

## Sequence performed

1. Docker and Compose validation.
2. `.env`, required variables and placeholders validation.
3. Dockerfiles and Compose structure validation.
4. Exactly four services: `web`, `api`, `worker`, `db`.
5. Existing PostgreSQL volume detection.
6. Local storage and Go cache preparation.
7. Image construction when missing, or with `--rebuild`.
8. `docker compose up -d db` and health wait.
9. `docker compose up -d api`; API applies migrations.
10. `/app/migrate` equivalent through `go run ./cmd/migrate`.
11. Bootstrap through `go run ./cmd/bootstrap`.
12. `docker compose up -d worker web`.
13. Healthchecks and connectivity through Vite.
14. Final summary without secrets.

## Recovering after accidental container deletion

```bash
./terra init
```

If the PostgreSQL volume exists, it is reused. The bootstrap detects the existing
administrator and does not overwrite credentials. Users, jobs and documents remain.

To also rebuild images:

```bash
./terra init --rebuild --no-cache
```

## Missing volume

If the volume does not exist but documents or backups do, initialization stops.
It does not silently create an empty database. Restore a local backup or use
`--allow-empty-db` only after confirming the loss is acceptable.

## Failure handling

```bash
./terra doctor
./terra logs api
./terra logs db
```

The script stops on failures and never reports success for unhealthy services.
Volumes are never deleted by initialization.

## Normal startup

```bash
./terra up
```

Use `init` for the first installation or full recovery; use `up` for routine starts.
