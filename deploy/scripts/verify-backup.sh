#!/usr/bin/env bash
# Verifies backup integrity without restoring into production.
set -euo pipefail
DIR="${1:-}"
if [[ -z "$DIR" || ! -d "$DIR" ]]; then
  echo "Usage: $0 <backup-directory>" >&2
  exit 2
fi
cd "$DIR"

if [[ -f SHA256SUMS ]]; then
  sha256sum -c SHA256SUMS
fi

DUMP="$DIR/terra.dump"
STORAGE="$DIR/storage.tar.gz"
if [[ ! -f "$DUMP" && -f "$DUMP.gpg" ]]; then
  echo "Encrypted dump found. Decrypt it first to verify: gpg --decrypt terra.dump.gpg > terra.dump"
  exit 1
fi
if [[ ! -f "$STORAGE" && -f "$STORAGE.gpg" ]]; then
  echo "Encrypted storage archive found. Decrypt it first to verify."
  exit 1
fi

pg_restore --list "$DUMP" > /dev/null
tar tzf "$STORAGE" > /dev/null
echo "Backup verified: $DIR"
