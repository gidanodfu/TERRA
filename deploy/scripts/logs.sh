#!/usr/bin/env bash
# =============================================================================
# TERRA - logs.sh
# Versión: 2.0.0
# Descripción: consulta logs de todos los servicios o de uno individual.
# Uso: ./deploy/scripts/logs.sh [web|api|worker|db] [-f] [-n LÍNEAS]
# Efectos: solo lectura. Los logs no deben contener secretos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() { printf 'Uso: logs.sh [web|api|worker|db] [-f|--follow] [-n|--lines N]\n'; }

service=""
follow=0
lines=200
while (($# > 0)); do
  case "$1" in
    web|api|worker|db) service="$1" ;;
    -f|--follow) follow=1 ;;
    -n|--lines)
      shift
      [[ $# -gt 0 && "$1" =~ ^[0-9]+$ ]] || { terra_error "-n requiere un número."; exit 2; }
      lines="$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Argumento inválido: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_check_env_file
terra_check_commands
if [[ -n "$service" && -z "$(terra_service_container "$service")" ]]; then
  terra_error "El contenedor $service no existe. Ejecute ./terra status."
  exit 1
fi
args=(logs --no-color --tail "$lines")
[[ "$follow" == "1" ]] && args+=(-f)
[[ -n "$service" ]] && args+=("$service")
terra_compose "${args[@]}"
