#!/usr/bin/env bash
# =============================================================================
# TERRA - bootstrap.sh
# Versión: 2.0.0
# Descripción: ejecuta el bootstrap administrativo idempotente en local.
# Uso: ./deploy/scripts/bootstrap.sh
# Efectos: crea el primer administrador solo si no existe.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

case "${1:-}" in -h|--help) printf 'Uso: bootstrap.sh\nEjecuta el bootstrap administrativo idempotente.\n'; exit 0 ;; esac
[[ $# -eq 0 ]] || { terra_error "Argumentos no permitidos."; exit 2; }
terra_check_env_file
terra_check_commands
terra_require_db_running
terra_require_api_running

migrations="$(terra_db_psql "SELECT count(*) FROM schema_migrations;" 2>/dev/null || echo '0')"
if [[ ! "$migrations" =~ ^[0-9]+$ ]] || ((migrations == 0)); then
  terra_error "No hay migraciones aplicadas. Ejecute ./terra migrate up."
  exit 1
fi
terra_step "Ejecutando bootstrap administrativo"
terra_compose exec -T api go run ./cmd/bootstrap
admins="$(terra_db_psql "SELECT count(*) FROM local_credentials;" 2>/dev/null || echo '0')"
if [[ "$admins" =~ ^[0-9]+$ ]] && ((admins > 0)); then
  terra_ok "Bootstrap verificado: existe al menos un administrador local."
else
  terra_error "No existe administrador local. Revise BOOTSTRAP_ADMIN_* en .env."
  exit 1
fi
