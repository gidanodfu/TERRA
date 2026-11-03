#!/usr/bin/env bash
# Idempotent first-administrator bootstrap. Runs inside the existing api service.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"

cd "$ROOT"
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml exec -T api /app/bootstrap
