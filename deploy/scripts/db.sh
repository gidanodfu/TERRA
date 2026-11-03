#!/usr/bin/env bash
# =============================================================================
# TERRA - db.sh
# Versión: 2.0.0
# Descripción: abre psql en el servicio PostgreSQL local.
# Uso: ./deploy/scripts/db.sh [-c "SQL"]
# Efectos: puede modificar datos si se ejecuta SQL; no borra el volumen.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  printf 'Uso: db.sh [-c "SQL"]\nAbre psql en el contenedor db.\n'
  exit 0
fi
terra_check_env_file
terra_check_commands
terra_require_db_running
user="$(terra_env_get POSTGRES_USER)"
db="$(terra_env_get POSTGRES_DB)"
if [[ "${1:-}" == "-c" ]]; then
  shift
  [[ $# -eq 1 ]] || { terra_error "-c requiere una consulta SQL."; exit 2; }
  terra_compose exec db psql -U "$user" -d "$db" -c "$1"
else
  terra_compose exec db psql -U "$user" -d "$db"
fi
