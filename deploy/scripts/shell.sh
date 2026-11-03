#!/usr/bin/env bash
# =============================================================================
# TERRA - shell.sh
# Versión: 2.0.0
# Descripción: abre una shell dentro de un servicio local.
# Uso: ./deploy/scripts/shell.sh <web|api|worker|db>
# Efectos: interactúa con el contenedor; no modifica datos por sí mismo.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

case "${1:-}" in
  -h|--help) printf 'Uso: shell.sh <web|api|worker|db>\n'; exit 0 ;;
esac
[[ $# -eq 1 ]] || { terra_error "Indique un servicio: web, api, worker o db."; exit 2; }
terra_assert_service "$1" || exit 2
service="$1"
[[ -n "$(terra_service_container "$service")" ]] || terra_die "El contenedor $service no existe. Ejecute ./terra up." 1
terra_info "Abriendo shell en $service…"
terra_compose exec "$service" sh
