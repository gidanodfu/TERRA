#!/usr/bin/env bash
# =============================================================================
# TERRA - up.sh
# Versión: 1.0.0
# Descripción: arranque habitual de TERRA reutilizando datos persistentes.
# Uso: ./deploy/scripts/up.sh <dev|prod> [--build]
# Requisitos: volumen PostgreSQL existente (use init.sh en la primera instalación).
# Efectos: crea/recrea contenedores e inicia los cuatro servicios. No elimina
#          volúmenes, no ejecuta bootstrap y no reinicializa la base de datos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 requiere init.sh.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: up.sh <dev|prod> [--build]

Arranca TERRA. Si los contenedores no existen pero el volumen de PostgreSQL sí,
los recrea conservando los datos. No ejecuta bootstrap automáticamente.

Opciones:
  --build     reconstruye las imágenes antes de arrancar
  -h, --help  muestra esta ayuda
EOF
}

if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift
build=0
while (($# > 0)); do
  case "$1" in
    --build) build=1 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

bash "$TERRA_SCRIPT_DIR/check.sh" "$TERRA_ENV_SHORT" -q
terra_ensure_storage

if ! terra_volume_exists; then
  if terra_storage_has_data; then
    terra_error "No existe el volumen PostgreSQL pero hay documentos almacenados."
    terra_error "No se iniciará una base vacía. Restaure el backup correspondiente o use init.sh --allow-empty-db."
  else
    terra_error "No existe el volumen PostgreSQL $TERRA_DB_VOLUME."
    terra_error "Use ./deploy/scripts/init.sh $TERRA_ENV_SHORT para la primera inicialización."
  fi
  exit 3
fi

if ! terra_storage_has_data; then
  terra_warn "El volumen documental está vacío. Verifique si es esperado antes de continuar."
fi

missing="$(terra_missing_images)"
if ((build == 1)) || [[ -n "$missing" ]]; then
  build_args=("$TERRA_ENV_SHORT" --skip-check)
  bash "$TERRA_SCRIPT_DIR/build.sh" "${build_args[@]}"
fi

terra_step "Iniciando servicios"
terra_compose up -d
for service in db api worker web; do
  terra_wait_healthy "$service" 240
done

if ! terra_verify_stack; then
  terra_error "El arranque terminó con fallos."
  terra_error "Ejecute ./deploy/scripts/status.sh $TERRA_ENV_SHORT y ./deploy/scripts/logs.sh $TERRA_ENV_SHORT."
  exit 1
fi

terra_print_summary "TERRA READY" 0
terra_ok "TERRA está en ejecución. Datos persistentes reutilizados."
