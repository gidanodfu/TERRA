#!/usr/bin/env bash
# =============================================================================
# TERRA - logs.sh
# Versión: 1.0.0
# Descripción: consulta logs de todos los servicios o de uno individual.
# Uso: ./deploy/scripts/logs.sh <dev|prod> [servicio] [-f] [-n LÍNEAS]
# Requisitos: Docker y configuración legibles.
# Efectos: solo lectura. Los logs de TERRA no deben contener secretos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: logs.sh <dev|prod> [web|api|worker|db] [-f|--follow] [-n|--lines N]

Sin servicio muestra todos. Por defecto imprime las últimas 200 líneas.
Los logs no incluyen tokens, contraseñas ni cookies.
EOF
}

if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift

service=""
follow=0
lines=200
while (($# > 0)); do
  case "$1" in
    web|api|worker|db) service="$1" ;;
    -f|--follow) follow=1 ;;
    -n|--lines)
      shift
      [[ $# -gt 0 && "$1" =~ ^[0-9]+$ ]] || { terra_error "-n requiere un número entero."; exit 2; }
      lines="$1"
      ;;
    --lines=*) lines="${1#*=}"; [[ "$lines" =~ ^[0-9]+$ ]] || { terra_error "--lines requiere un número."; exit 2; } ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Argumento inválido: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_check_env_file
terra_check_commands
if [[ -n "$service" && -z "$(terra_service_container "$service")" ]]; then
  terra_error "El contenedor $service no existe en el proyecto $TERRA_PROJECT."
  terra_error "Use ./deploy/scripts/status.sh $TERRA_ENV_SHORT para ver el estado actual."
  exit 1
fi

args=(logs --no-color --tail "$lines")
[[ "$follow" == "1" ]] && args+=(-f)
[[ -n "$service" ]] && args+=("$service")
terra_compose "${args[@]}"
