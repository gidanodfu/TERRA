# Commands reference

All scripts resolve the repository root automatically and can be executed from any
directory. `./terra` is the official interface and delegates to `deploy/scripts/`.
No command requires Go, Node or PostgreSQL on the host.

## Main interface

| Command | Responsibility |
|---|---|
| `./terra help` | Command reference |
| `./terra check` | Preflight validation |
| `./terra doctor` | Full runtime diagnosis |
| `./terra build [--no-cache] [web|api]` | Build local images |
| `./terra init [--rebuild] [--no-cache]` | First init or recovery |
| `./terra up [--build]` | Routine startup |
| `./terra down [--remove]` | Stop; `--remove` keeps volumes |
| `./terra restart [service]` | Restart all or one service |
| `./terra status` | Containers, health, volumes, PostgreSQL, API, Vite |
| `./terra logs [service] [-f] [-n N]` | Logs |
| `./terra shell <service>` | Shell inside web/api/worker/db |
| `./terra db [-c "SQL"]` | psql in the db container |
| `./terra migrate <up|status|version>` | Migrations |
| `./terra bootstrap` | Idempotent administrator bootstrap |
| `./terra test [suite]` | Docker-only test suites |
| `./terra backup` | Local PostgreSQL + documents backup |
| `./terra restore [backup-dir]` | Restore latest or specified local backup |

## Scripts

| Script | Docker operations | Modifies data? |
|---|---|---|
| `check.sh` | `docker info`, compose config | No |
| `doctor.sh` | inspect, compose exec, HTTP checks | No |
| `build.sh` | `docker compose build` | No |
| `init.sh` | build, up, exec migrate/bootstrap | Creates DB schema/admin if missing |
| `up.sh` | compose up, healthchecks | No |
| `down.sh` | compose stop/down | No; never `-v` |
| `restart.sh` | compose restart | No |
| `status.sh` | compose ps/inspect, psql read | No |
| `logs.sh` | compose logs | No |
| `shell.sh` | compose exec sh | Depends on user commands |
| `db.sh` | compose exec psql | Depends on user SQL |
| `migrate.sh` | compose exec `go run ./cmd/migrate` | Schema only |
| `bootstrap.sh` | compose exec `go run ./cmd/bootstrap` | Creates admin if missing |
| `test.sh` | compose exec Go/Vitest/Playwright | Uses disposable `terra_test` DB |
| `backup-local.sh` | pg_dump, tar | Creates a new backup directory |
| `restore-local.sh` | pg_restore, tar, compose restart | **Destructive**, confirmed |
| `verify-backup.sh` | checksum/tar/pg_restore | No |
| `consistency-check.sh` | psql + filesystem | No |
| `retention.sh` | psql + filesystem | Only with `--apply` |
| `help.sh` | none | No |

## Examples

```bash
./terra build --no-cache
./terra test backend integration
./terra shell worker
./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"
./terra logs api -n 300
CONFIRM=yes ./terra restore backups/20261103T210000Z
```

## Exit codes

- `0`: success.
- `1`: validation, build, service or test failure.
- `2`: invalid arguments.
- `3`: destructive action not authorized or cancelled.

## Safety rules

- `down.sh` never uses `docker compose down -v`.
- No script removes volumes.
- Bootstrap never overwrites credentials.
- Tests use a disposable `terra_test` database and never the development database.
- Backups are never overwritten.
