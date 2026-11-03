#!/usr/bin/env bash
# Snapshot retention. Dry-run by default; APPLY=yes removes old jobs and their files.
# RETENTION_DAYS=0 disables retention.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
cd "$ROOT"

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ "${RETENTION_DAYS:-0}" -le 0 ]]; then
  echo "RETENTION_DAYS=0: retention disabled."
  exit 0
fi

STORAGE="${STORAGE_HOST_PATH:-../data/dev}"
if [[ "$STORAGE" != /* ]]; then
  STORAGE="$DEPLOY/$STORAGE"
fi

COMPOSE=(docker compose --env-file .env -f deploy/compose.yaml)
SQL="SELECT id, COALESCE(regexp_replace(min(relative_path), '(job-[0-9a-f-]+/Mi unidad/).*$', '\\1'), '')
  FROM download_jobs j LEFT JOIN download_items i ON i.job_id = j.id
  WHERE j.status IN ('completed','partially_completed','failed','cancelled')
    AND COALESCE(j.finished_at, j.created_at) < now() - make_interval(days => ${RETENTION_DAYS})
  GROUP BY j.id"

echo "Jobs eligible for retention (${RETENTION_DAYS} days):"
"${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$SQL"

if [[ "${APPLY:-}" != "yes" ]]; then
  echo "Dry run. Set APPLY=yes to delete these snapshots and their database rows."
  exit 0
fi

while IFS='|' read -r job_id prefix; do
  [[ -z "$job_id" ]] && continue
  if [[ -n "$prefix" && "$prefix" == areas/* && "$prefix" != *".."* ]]; then
    target="$STORAGE/${prefix%/}"
    target="${target%/Mi unidad}"
    rm -rf -- "$target"
  fi
  "${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c \
    "BEGIN;
     DELETE FROM stored_files WHERE job_id = '$job_id';
     DELETE FROM download_items WHERE job_id = '$job_id';
     DELETE FROM job_events WHERE job_id = '$job_id';
     DELETE FROM download_job_roots WHERE job_id = '$job_id';
     DELETE FROM download_jobs WHERE id = '$job_id';
     COMMIT;"
  echo "Purged job $job_id"
done < <("${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$SQL")
