#!/usr/bin/env bash
# =============================================================================
# TERRA - build.sh
# Versión: 1.0.0
# Descripción: construye las imágenes de frontend y backend (API/worker).
# Uso: ./deploy/scripts/build.sh <dev|prod> [--no-cache] [--no-pull] [servicio...]
# Requisitos: entorno validado; Docker BuildKit.
# Efectos: crea imágenes para el proyecto del ambiente. No toca volúmenes,
#          contenedores, documentos ni bases de datos.
# Códigos: 0 correcto · 1 fallo de construcción · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: build.sh <dev|prod> [opciones] [web|api|worker ...]

Construye las imágenes del ambiente seleccionado. API y worker comparten la
misma imagen backend; PostgreSQL usa una imagen fijada y no se reconstruye.

Opciones:
  --no-cache    reconstruye sin caché
  --no-pull     no actualiza imágenes base
  --skip-check  omite la prevalidación (uso interno)
  -h, --help    muestra esta ayuda
EOF
}

if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift

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
    web|api|worker) services+=("$1") ;;
    db) terra_die "La imagen de PostgreSQL está fijada y no se reconstruye desde el código." 2 ;;
    *) terra_error "Argumento inválido: $1"; usage; exit 2 ;;
  esac
  shift
done
if ((${#services[@]} == 0)); then services=(web api worker); fi

if [[ "$skip_check" != "1" ]]; then
  bash "$TERRA_SCRIPT_DIR/check.sh" "$TERRA_ENV_SHORT" -q
fi

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

build_args=(build)
[[ "$pull" == "1" ]] && build_args+=(--pull)
[[ "$no_cache" == "1" ]] && build_args+=(--no-cache)
build_args+=("${services[@]}")

terra_step "Construyendo imágenes: ${services[*]}"
terra_dim "Proyecto Docker: $TERRA_PROJECT · Ambiente: $TERRA_ENV_SHORT"
if ! terra_compose "${build_args[@]}"; then
  terra_error "La construcción falló. Revise la salida anterior."
  exit 1
fi

terra_step "Verificando imágenes construidas"
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
if ((failed != 0)); then
  exit 1
fi

terra_ok "Construcción completada sin modificar datos persistentes."
