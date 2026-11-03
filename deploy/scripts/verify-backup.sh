#!/usr/bin/env bash
# =============================================================================
# TERRA - verify-backup.sh
# Versión: 2.0.0
# Descripción: verifica checksums y estructura de un backup sin restaurarlo.
# Uso: ./deploy/scripts/verify-backup.sh <backup-dir>
# Requisitos: Docker para validar el dump con pg_restore.
# Efectos: solo lectura; no modifica el backup.
# Códigos: 0 válido · 1 inválido · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

if (($# == 1)); then
  case "$1" in
    -h|--help)
      printf 'Uso: %s <backup-dir>\nVerifica checksums, tar y dump sin restaurar.\n' "$(basename "$0")"
      exit 0
      ;;
  esac
fi
if (($# != 1)); then
  printf 'Uso: %s <backup-dir>\n' "$(basename "$0")" >&2
  exit 2
fi
dir="$1"
[[ -d "$dir" ]] || terra_die "No existe el directorio: $dir"
dir="$(cd -- "$dir" && pwd)"
[[ -f "$dir/SHA256SUMS" ]] || terra_die "Falta SHA256SUMS."

(cd "$dir" && sha256sum -c SHA256SUMS) || terra_die "Checksums inválidos."

archive="$dir/storage.tar.gz"
[[ -f "$archive.gpg" ]] && archive="$archive.gpg"
dump="$dir/terra.dump"
[[ -f "$dump.gpg" ]] && dump="$dump.gpg"

if [[ "$archive" == *.gpg ]]; then
  terra_warn "Almacenamiento cifrado: no se puede listar sin la clave."
else
  tar tzf "$archive" >/dev/null || terra_die "storage.tar.gz inválido."
fi

if [[ "$dump" == *.gpg ]]; then
  terra_warn "Dump cifrado: no se puede validar con pg_restore sin la clave."
else
  if command -v pg_restore >/dev/null 2>&1; then
    pg_restore --list "$dump" >/dev/null || terra_die "pg_restore no reconoce el dump."
  else
    terra_info "pg_restore local no disponible; validando con la imagen oficial…"
    "$TERRA_DOCKER_BIN" run --rm -i postgres:18-alpine pg_restore --list < "$dump" >/dev/null \
      || terra_die "pg_restore no reconoce el dump."
  fi
fi
terra_ok "Backup válido: $dir"
