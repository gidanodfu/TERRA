#!/usr/bin/env bash
# =============================================================================
# TERRA - consistency-check.sh
# Versión: 2.0.0
# Descripción: compara stored_files completados con el almacenamiento local.
# Uso: ./deploy/scripts/consistency-check.sh
# Efectos: solo lectura.
# Códigos: 0 consistente · 1 faltan archivos · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

case "${1:-}" in -h|--help) printf 'Uso: consistency-check.sh\nCompara PostgreSQL con el almacenamiento local.\n'; exit 0 ;; esac
[[ $# -eq 0 ]] || { terra_error "Argumentos no permitidos."; exit 2; }
terra_check_env_file
terra_check_commands
terra_require_db_running
storage_path="$(terra_storage_path)"
[[ -d "$storage_path" ]] || terra_die "No existe el almacenamiento: $storage_path" 1

rows="$(terra_db_psql "SELECT count(*) FROM stored_files WHERE status='completed';" 2>/dev/null || echo '?')"
if [[ ! "$rows" =~ ^[0-9]+$ ]]; then
  terra_error "No fue posible consultar stored_files."
  exit 1
fi
missing=0
while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  if [[ ! -f "$storage_path/$rel" ]]; then
    terra_error "FALTA: $rel"
    missing=$((missing + 1))
  fi
done < <(terra_db_psql "SELECT relative_path FROM stored_files WHERE status='completed' ORDER BY relative_path;" 2>/dev/null || true)
printf 'Archivos completados en base de datos: %s\nArchivos faltantes: %s\n' "$rows" "$missing"
if ((missing > 0)); then
  terra_error "Inconsistencia detectada. Restaure un backup local."
  exit 1
fi
terra_ok "PostgreSQL y almacenamiento son consistentes."
