#!/usr/bin/env bash
# =============================================================================
# TERRA - consistency-check.sh
# Versión: 2.0.0
# Descripción: verifica que cada stored_file completado exista en disco.
# Uso: ./deploy/scripts/consistency-check.sh <dev|prod>
# Requisitos: PostgreSQL activo y almacenamiento accesible.
# Efectos: solo lectura.
# Códigos: 0 consistente · 1 faltan archivos · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

if (($# == 0)); then terra_usage_env consistency-check.sh; exit 2; fi
case "$1" in
  -h|--help)
    printf 'Uso: consistency-check.sh <dev|prod>\nVerifica stored_files contra el almacenamiento. Solo lectura.\n'
    exit 0
    ;;
esac
terra_parse_environment "$1"
shift
[[ $# -eq 0 ]] || { terra_error "Argumentos extra no permitidos."; exit 2; }

terra_check_env_file
terra_check_commands
terra_require_db_running
storage_path="$(terra_storage_path)"
[[ -d "$storage_path" ]] || terra_die "No existe el almacenamiento: $storage_path"

rows="$(terra_db_psql "SELECT count(*) FROM stored_files WHERE status='completed';" 2>/dev/null || echo '?')"
if [[ ! "$rows" =~ ^[0-9]+$ ]]; then
  terra_error "No fue posible consultar stored_files en PostgreSQL."
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

printf 'Archivos completados en base de datos: %s\n' "$rows"
printf 'Archivos faltantes en disco: %s\n' "$missing"
if ((missing > 0)); then
  terra_error "Inconsistencia detectada. Restaure desde backup antes de continuar."
  exit 1
fi
terra_ok "Base de datos y almacenamiento son consistentes."
