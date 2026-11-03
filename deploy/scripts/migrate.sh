#!/usr/bin/env bash
# =============================================================================
# TERRA - migrate.sh
# Versión: 1.0.0
# Descripción: aplica migraciones o consulta su estado/version.
# Uso: ./deploy/scripts/migrate.sh <dev|prod> <up|status|version>
# Requisitos: PostgreSQL activo; para 'up', API activa.
# Efectos: 'up' aplica migraciones versionadas dentro del contenedor api.
#          No crea contenedores de migración ni ejecuta rollback automático.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: migrate.sh <dev|prod> <up|status|version>

  up       aplica migraciones pendientes con advisory lock
  status   muestra las migraciones aplicadas
  version  muestra la última versión aplicada

No existe rollback automático. Las migraciones se versionan y se aplican dentro
del servicio api existente.
EOF
}

if (($# < 2)); then usage; exit 2; fi
terra_parse_environment "$1"
case "$2" in -h|--help) usage; exit 0 ;; esac
action="$2"
shift 2
[[ $# -eq 0 ]] || { terra_error "Argumentos extra no permitidos."; exit 2; }
case "$action" in up|status|version) ;; *) terra_error "Acción inválida: $action"; usage; exit 2 ;; esac

terra_check_env_file
terra_check_commands
terra_require_db_running

case "$action" in
  up)
    terra_require_api_running
    terra_step "Aplicando migraciones dentro del contenedor api"
    terra_compose exec -T api /app/migrate
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
