#!/usr/bin/env bash
# =============================================================================
# TERRA - migrate.sh
# Versión: 2.0.0
# Descripción: aplica o consulta migraciones dentro del entorno local.
# Uso: ./deploy/scripts/migrate.sh <up|status|version>
# Efectos: 'up' modifica el esquema de PostgreSQL local.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: migrate.sh <up|status|version>

  up       aplica migraciones con advisory lock dentro del contenedor api
  status   muestra migraciones aplicadas
  version  muestra la última versión aplicada
USAGE
}

action="${1:-}"
case "$action" in
  -h|--help) usage; exit 0 ;;
  up|status|version) ;;
  *) usage; exit 2 ;;
esac
terra_check_env_file
terra_check_commands
terra_require_db_running

case "$action" in
  up)
    terra_require_api_running
    terra_step "Aplicando migraciones dentro de api"
    terra_compose exec -T api go run ./cmd/migrate
    terra_ok "Migraciones aplicadas o ya vigentes."
    ;;
  status)
    terra_step "Migraciones aplicadas"
    terra_db_psql "SELECT version || ' | ' || to_char(applied_at, 'YYYY-MM-DD HH24:MI:SS') FROM schema_migrations ORDER BY version;"
    ;;
  version)
    terra_db_psql "SELECT COALESCE(max(version), 'sin migraciones') FROM schema_migrations;"
    ;;
esac
