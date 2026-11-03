#!/usr/bin/env bash
# =============================================================================
# TERRA - restart.sh
# Versión: 1.0.0
# Descripción: reinicia todos los servicios o uno individual.
# Uso: ./deploy/scripts/restart.sh <dev|prod> [web|api|worker|db]
# Requisitos: contenedores existentes; use up.sh/init.sh si fueron eliminados.
# Efectos: reinicia procesos; no modifica volúmenes ni datos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: restart.sh <dev|prod> [web|api|worker|db]

Sin servicio reinicia los cuatro. Con servicio reinicia solo el indicado.
No elimina volúmenes, contenedores ni documentos.
EOF
}

if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift
service=""
while (($# > 0)); do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    web|api|worker|db) service="$1" ;;
    *) terra_error "Servicio inválido: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_check_env_file
terra_check_commands

targets=("${TERRA_ALLOWED_SERVICES[@]}")
if [[ -n "$service" ]]; then
  targets=("$service")
  if [[ -z "$(terra_service_container "$service")" ]]; then
    terra_error "El contenedor $service no existe."
    terra_error "Use ./deploy/scripts/up.sh $TERRA_ENV_SHORT o ./deploy/scripts/init.sh $TERRA_ENV_SHORT."
    exit 1
  fi
fi

terra_step "Reiniciando: ${targets[*]}"
terra_compose restart "${targets[@]}"
for target in "${targets[@]}"; do
  terra_wait_healthy "$target" 180
done

terra_ok "Reinicio completado. Los datos persistentes no fueron modificados."
