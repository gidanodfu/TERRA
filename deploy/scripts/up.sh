#!/usr/bin/env bash
# =============================================================================
# TERRA - up.sh
# Versión: 2.0.0
# Descripción: arranque habitual reutilizando datos persistentes.
# Uso: ./deploy/scripts/up.sh [--build]
# Requisitos: volumen PostgreSQL existente.
# Efectos: crea/recrea contenedores. No ejecuta bootstrap ni borra datos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 requiere init.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: up.sh [--build]
Arranca TERRA. Si faltan imágenes, las construye. No borra datos.
USAGE
}

build=0
while (($# > 0)); do
  case "$1" in
    --build) build=1 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

bash "$TERRA_SCRIPT_DIR/check.sh" -q
terra_ensure_storage
terra_ensure_caches
if ! terra_volume_exists; then
  if terra_storage_has_data; then
    terra_error "No existe el volumen PostgreSQL pero hay documentos. Restaure un backup; no se iniciará una base vacía."
  else
    terra_error "No existe el volumen PostgreSQL. Use ./terra init."
  fi
  exit 3
fi
if ! terra_storage_has_data; then
  terra_warn "El volumen documental está vacío. Verifique si es esperado."
fi

missing="$(terra_missing_images)"
if ((build == 1)) || [[ -n "$missing" ]]; then
  bash "$TERRA_SCRIPT_DIR/build.sh" --skip-check
fi

terra_step "Iniciando servicios"
terra_compose up -d
for service in db api worker web; do
  terra_wait_healthy "$service" 240
done
if ! terra_verify_stack; then
  terra_error "El arranque terminó con fallos. Ejecute ./terra doctor."
  exit 1
fi
terra_print_summary "TERRA READY" 0
terra_ok "TERRA está en ejecución. Datos persistentes reutilizados."
