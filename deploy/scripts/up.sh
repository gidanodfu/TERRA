#!/usr/bin/env bash
# =============================================================================
# TERRA - up.sh
# Versión: 2.0.0
# Descripción: arranque habitual reutilizando datos persistentes.
# Uso: ./deploy/scripts/up.sh [--build] [--recreate[=servicio]]
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
Uso: up.sh [--build] [--recreate[=web|api|worker|db]]

Arranca TERRA. Si faltan imágenes, las construye. No borra datos.
--recreate        recrea todos los contenedores con la configuración actual.
--recreate=api    recrea solo el servicio indicado.
USAGE
}

build=0
recreate=""
while (($# > 0)); do
  case "$1" in
    --build) build=1 ;;
    --recreate) recreate="all" ;;
    --recreate=*) recreate="${1#*=}" ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done
case "$recreate" in
  ""|all|web|api|worker|db) ;;
  *) terra_error "Servicio inválido para --recreate: $recreate"; usage; exit 2 ;;
esac

bash "$TERRA_SCRIPT_DIR/check.sh" -q
terra_ensure_storage
terra_ensure_caches
if ! terra_volume_exists; then
  if terra_storage_has_data; then
    terra_error "No existe el volumen PostgreSQL pero hay documentos. Restaure una copia de seguridad; no se iniciará una base vacía."
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
if [[ "$recreate" == "all" ]]; then
  terra_compose up -d --force-recreate
elif [[ -n "$recreate" ]]; then
  terra_compose up -d --force-recreate "$recreate"
else
  terra_compose up -d
  # El servicio web se recrea siempre para no reutilizar un contenedor con
  # montajes/volúmenes de dependencias obsoletos.
  terra_compose up -d --force-recreate web
fi
for service in db api worker web; do
  terra_wait_healthy "$service" 240
done
if ! terra_verify_stack; then
  terra_error "El arranque terminó con fallos. Ejecute ./terra doctor."
  exit 1
fi
terra_print_summary "TERRA READY" 0
terra_ok "TERRA está en ejecución. Datos persistentes reutilizados."
