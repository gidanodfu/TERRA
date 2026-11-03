#!/usr/bin/env bash
# Cross-checks stored_files rows against the document volume.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
cd "$ROOT"

set -a
# shellcheck disable=SC1091
source .env
set +a

STORAGE="${STORAGE_HOST_PATH:-../data/dev}"
if [[ "$STORAGE" != /* ]]; then
  STORAGE="$DEPLOY/$STORAGE"
fi

COMPOSE=(docker compose --env-file .env -f deploy/compose.yaml)
DB_ROWS=$("${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "SELECT count(*) FROM stored_files WHERE status='completed'")

MISSING=0
while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  if [[ ! -f "$STORAGE/$rel" ]]; then
    echo "MISSING: $rel"
    MISSING=$((MISSING + 1))
  fi
done < <("${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "SELECT relative_path FROM stored_files WHERE status='completed' ORDER BY relative_path")

echo "Database completed files: $DB_ROWS"
echo "Missing files on disk: $MISSING"
if [[ "$MISSING" -gt 0 ]]; then
  exit 1
fi
echo "Storage and database are consistent."
