#!/usr/bin/env bash
# Creates a coordinated backup: PostgreSQL custom-format dump + document volume + checksums.
# The token encryption key is NOT included and must be backed up by a separate procedure.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DEPLOY/.." && pwd)"
cd "$ROOT"

set -a
# shellcheck disable=SC1091
source .env
set +a

STAMP="$(date +%Y%m%dT%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/$STAMP}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STORAGE="${STORAGE_HOST_PATH:-../data/dev}"
if [[ "$STORAGE" != /* ]]; then
  STORAGE="$DEPLOY/$STORAGE"
fi

COMPOSE=(docker compose --env-file .env -f deploy/compose.yaml)

echo "Backing up PostgreSQL…"
"${COMPOSE[@]}" exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$BACKUP_DIR/terra.dump"

echo "Backing up document volume…"
tar czf "$BACKUP_DIR/storage.tar.gz" -C "$STORAGE" .

(cd "$BACKUP_DIR" && sha256sum terra.dump storage.tar.gz > SHA256SUMS)

if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  echo "Encrypting backups for $BACKUP_GPG_RECIPIENT…"
  gpg --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$BACKUP_DIR/terra.dump"
  gpg --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$BACKUP_DIR/storage.tar.gz"
  rm -f "$BACKUP_DIR/terra.dump" "$BACKUP_DIR/storage.tar.gz"
  (cd "$BACKUP_DIR" && sha256sum ./*.gpg > SHA256SUMS)
fi

echo "Backup completed: $BACKUP_DIR"
echo "Remember: TOKEN_ENCRYPTION_KEY must be backed up separately; without it refresh tokens cannot be decrypted."
