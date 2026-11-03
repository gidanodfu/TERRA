#!/usr/bin/env bash
# DESTRUCTIVE: restores PostgreSQL from a pg_dump custom-format file.
# Requires CONFIRM=yes. Stop api and worker first.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
cd "$ROOT"

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: CONFIRM=yes $0 <terra.dump>" >&2
  exit 2
fi
if [[ "${CONFIRM:-}" != "yes" ]]; then
  echo "Refusing to restore without CONFIRM=yes." >&2
  exit 3
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

COMPOSE=(docker compose --env-file .env -f deploy/compose.yaml)
echo "Stopping API and worker…"
"${COMPOSE[@]}" stop api worker

echo "Restoring database…"
"${COMPOSE[@]}" exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$DUMP"

echo "Starting API and worker…"
"${COMPOSE[@]}" start db
"${COMPOSE[@]}" start api worker
echo "Database restore completed."
