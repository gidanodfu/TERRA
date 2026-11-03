#!/usr/bin/env bash
# DESTRUCTIVE: restores the document volume from storage.tar.gz.
# Requires CONFIRM=yes and the worker stopped.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
cd "$ROOT"

ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: CONFIRM=yes $0 <storage.tar.gz>" >&2
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

STORAGE="${STORAGE_HOST_PATH:-../data/dev}"
if [[ "$STORAGE" != /* ]]; then
  STORAGE="$DEPLOY/$STORAGE"
fi

COMPOSE=(docker compose --env-file .env -f deploy/compose.yaml)
"${COMPOSE[@]}" stop api worker web

echo "Restoring document volume into $STORAGE…"
tar xzf "$ARCHIVE" -C "$STORAGE"
chown -R 10001:10001 "$STORAGE"

"${COMPOSE[@]}" start db api worker web
echo "Storage restore completed."
