#!/usr/bin/env bash
# =============================================================================
# TERRA - build.sh
# Versión: 2.0.0
# Descripción: construye las imágenes locales de Vite y del backend.
# Uso: ./deploy/scripts/build.sh [--no-cache] [--no-pull] [web|api|worker ...]
# Requisitos: Docker con BuildKit.
# Efectos: crea/actualiza imágenes. No toca contenedores, volúmenes ni datos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: build.sh [--no-cache] [--no-pull] [web|api|worker ...]

Construye imágenes locales. api y worker comparten terra-backend:local.
PostgreSQL usa una imagen fijada y no se reconstruye.

Opciones:
  --no-cache    reconstruye sin caché
  --no-pull     no actualiza imágenes base
  --skip-check  omite prevalidación (uso interno)
  -h, --help    muestra esta ayuda
USAGE
}

no_cache=0
pull=1
skip_check=0
services=()
while (($# > 0)); do
  case "$1" in
    --no-cache) no_cache=1 ;;
    --no-pull) pull=0 ;;
    --skip-check) skip_check=1 ;;
    -h|--help) usage; exit 0 ;;
    web) services+=(web) ;;
    api|worker) services+=(api) ;;
    db) terra_die "La imagen de PostgreSQL está fijada y no se reconstruye." 2 ;;
    *) terra_error "Argumento inválido: $1"; usage; exit 2 ;;
  esac
  shift
done
if ((${#services[@]} == 0)); then services=(web api); fi
# Deduplicar api si se pidieron api y worker.
mapfile -t services < <(printf '%s\n' "${services[@]}" | sort -u)

if [[ "$skip_check" != "1" ]]; then
  bash "$TERRA_SCRIPT_DIR/check.sh" -q
fi

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
build_args=(build)
[[ "$pull" == "1" ]] && build_args+=(--pull)
[[ "$no_cache" == "1" ]] && build_args+=(--no-cache)
build_args+=("${services[@]}")

terra_step "Construyendo imágenes: ${services[*]}"
if ! terra_compose "${build_args[@]}"; then
  terra_error "La construcción falló."
  exit 1
fi

terra_step "Verificando imágenes"
failed=0
for service in "${services[@]}"; do
  image="$(terra_image_name "$service")"
  if "$TERRA_DOCKER_BIN" image inspect "$image" >/dev/null 2>&1; then
    info="$("$TERRA_DOCKER_BIN" images --format '{{.Repository}}:{{.Tag}} {{.Size}}' "$image" | head -n1)"
    terra_ok "Imagen disponible: ${info:-$image}"
  else
    terra_error "No se encontró la imagen esperada: $image"
    failed=1
  fi
done
if ((failed != 0)); then exit 1; fi
terra_ok "Construcción completada sin modificar datos."
