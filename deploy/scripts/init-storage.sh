#!/usr/bin/env bash
# Creates the host storage directory with the UID/GID used by the non-root API and worker.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

TARGET="${1:-${STORAGE_HOST_PATH:-../data/dev}}"
if [[ "$TARGET" != /* ]]; then
  TARGET="$DEPLOY/$TARGET"
fi
mkdir -p "$TARGET"/{staging,areas}
# The backend image runs as UID/GID 10001.
chown -R 10001:10001 "$TARGET"
chmod 750 "$TARGET" "$TARGET/staging" "$TARGET/areas"
echo "Storage ready: $TARGET"
