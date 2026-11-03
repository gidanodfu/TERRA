#!/usr/bin/env bash
# =============================================================================
# TERRA - init.sh
# Versión: 2.0.0
# Descripción: inicializa el entorno local o recupera contenedores eliminados.
# Uso: ./deploy/scripts/init.sh [--rebuild] [--no-cache] [--allow-empty-db]
# Requisitos: Docker, Compose, .env y almacenamiento local.
# Efectos: crea imágenes/contenedores, migra, ejecuta bootstrap y verifica.
#          NUNCA elimina volúmenes, documentos ni bases de datos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 autorización requerida.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: init.sh [--rebuild] [--no-cache] [--allow-empty-db]

Inicializa TERRA en local. Si el volumen PostgreSQL existe, lo reutiliza.
Si los contenedores fueron eliminados, los recrea sin tocar datos.

Opciones:
  --rebuild         reconstruye imágenes antes de arrancar
  --no-cache        reconstruye sin caché (implica --rebuild)
  --allow-empty-db  autoriza una base vacía si detecta datos/backups previos
  -h, --help        muestra esta ayuda
USAGE
}

rebuild=0
no_cache=0
allow_empty=0
while (($# > 0)); do
  case "$1" in
    --rebuild) rebuild=1 ;;
    --no-cache) rebuild=1; no_cache=1 ;;
    --allow-empty-db) allow_empty=1 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_step "TERRA INIT — desarrollo local"
bash "$TERRA_SCRIPT_DIR/check.sh" --for-init -q
terra_ensure_storage
terra_ensure_caches

volume_present=0
storage_data=0
if terra_volume_exists; then volume_present=1; fi
if terra_storage_has_data; then storage_data=1; fi
backups="$(terra_backups)"

terra_step "Comprobando datos persistentes"
if ((volume_present == 1)); then
  terra_ok "Volumen PostgreSQL existente: $TERRA_DB_VOLUME (se reutilizará)"
else
  terra_warn "No existe el volumen PostgreSQL $TERRA_DB_VOLUME."
  if ((storage_data == 1)) || [[ -n "$backups" ]]; then
    terra_warn "Hay documentos o backups previos; crear una base vacía puede ocultar datos."
    if [[ -n "$backups" ]]; then terra_warn "Backups disponibles: $backups"; fi
    if [[ "$allow_empty" != "1" ]]; then
      terra_error "Use --allow-empty-db solo si acepta iniciar sin esos datos, o restaure un backup."
      exit 3
    fi
    terra_confirm "¿Confirma crear una base vacía pese a existir datos/backups?" || exit 3
  fi
fi
if ((volume_present == 1 && storage_data == 0)); then
  terra_warn "El volumen de base de datos existe pero el almacenamiento está vacío."
fi

missing="$(terra_missing_images)"
if ((rebuild == 1)) || [[ -n "$missing" ]]; then
  build_args=()
  [[ "$no_cache" == "1" ]] && build_args+=(--no-cache)
  bash "$TERRA_SCRIPT_DIR/build.sh" --skip-check "${build_args[@]}"
else
  terra_ok "Imágenes locales disponibles; se reutilizan."
fi

terra_step "Iniciando PostgreSQL"
terra_compose up -d db
terra_wait_healthy db 240
user="$(terra_env_get POSTGRES_USER)"
db="$(terra_env_get POSTGRES_DB)"
if ! terra_compose exec -T db pg_isready -U "$user" -d "$db" >/dev/null 2>&1; then
  terra_error "PostgreSQL no acepta conexiones. Ejecute ./terra logs db."
  exit 1
fi
if ! terra_db_psql "SELECT 1;" >/dev/null 2>&1; then
  terra_error "No fue posible ejecutar una consulta de prueba en PostgreSQL."
  exit 1
fi
terra_ok "PostgreSQL saludable"

terra_step "Iniciando API y aplicando migraciones"
terra_compose up -d api
terra_wait_healthy api 300
if ! terra_compose exec -T api go run ./cmd/migrate; then
  terra_error "Las migraciones fallaron. Ejecute ./terra logs api."
  exit 1
fi
migrations="$(terra_db_psql "SELECT count(*) FROM schema_migrations;" 2>/dev/null || true)"
if [[ ! "$migrations" =~ ^[0-9]+$ ]] || ((migrations == 0)); then
  terra_error "No se detectaron migraciones aplicadas."
  exit 1
fi
terra_ok "Migraciones aplicadas: $migrations"

terra_step "Ejecutando bootstrap administrativo"
if ! terra_compose exec -T api go run ./cmd/bootstrap; then
  terra_error "El bootstrap falló. No se crearán credenciales a la fuerza."
  exit 1
fi
admins="$(terra_db_psql "SELECT count(*) FROM local_credentials;" 2>/dev/null || true)"
if [[ ! "$admins" =~ ^[0-9]+$ ]] || ((admins == 0)); then
  terra_error "No existe administrador local después del bootstrap."
  exit 1
fi
terra_ok "Administrador local verificado"

terra_step "Iniciando worker y web (Vite)"
terra_compose up -d worker web
terra_wait_healthy worker 180
terra_wait_healthy web 180

if ! terra_verify_stack; then
  terra_error "La inicialización terminó con fallos. Los servicios se dejan activos para diagnóstico."
  terra_error "Ejecute ./terra doctor y ./terra logs."
  exit 1
fi

terra_print_summary "TERRA INITIALIZATION" 1
terra_ok "Inicialización local completada. Los datos persistentes fueron conservados."
