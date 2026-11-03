#!/usr/bin/env bash
# =============================================================================
# TERRA - init.sh
# Versión: 1.0.0
# Descripción: inicializa TERRA por primera vez o reconstruye contenedores
#              conservando los datos persistentes existentes.
# Uso: ./deploy/scripts/init.sh <dev|prod> [--rebuild] [--no-cache] [--allow-empty-db]
# Requisitos: Docker, Compose, configuración válida y almacenamiento accesible.
# Efectos: crea imágenes y contenedores, aplica migraciones y ejecuta bootstrap.
#          NUNCA elimina volúmenes, documentos ni bases de datos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 autorización requerida.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: init.sh <dev|prod> [opciones]

Inicializa TERRA de forma segura. Si el volumen de PostgreSQL ya existe, lo
reutiliza. Si los contenedores fueron eliminados, los recrea sin tocar datos.

Opciones:
  --rebuild         reconstruye las imágenes antes de arrancar
  --no-cache        reconstruye imágenes sin caché (implica --rebuild)
  --allow-empty-db  autoriza crear una base vacía cuando faltan datos previos
  -h, --help        muestra esta ayuda

La primera instalación de desarrollo puede ejecutarse sin opciones. En
producción se exige --allow-empty-db y una confirmación explícita.
EOF
}

if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift

rebuild=0
no_cache=0
allow_empty=0
while (($# > 0)); do
  case "$1" in
    --rebuild) rebuild=1 ;;
    --no-cache) no_cache=1; rebuild=1 ;;
    --allow-empty-db) allow_empty=1 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_step "TERRA INIT — ambiente $TERRA_ENV_SHORT"
terra_info "Proyecto Docker: $TERRA_PROJECT"

# FASE 1 — Prevalidación
bash "$TERRA_SCRIPT_DIR/check.sh" "$TERRA_ENV_SHORT" --for-init -q
terra_ensure_storage

volume_present=0
storage_data=0
if terra_volume_exists; then volume_present=1; fi
if terra_storage_has_data; then storage_data=1; fi
backups="$(terra_backups_for_env)"

terra_step "Comprobando datos persistentes"
if ((volume_present == 1)); then
  terra_ok "Volumen PostgreSQL existente: $TERRA_DB_VOLUME (se reutilizará)"
else
  terra_warn "No existe el volumen PostgreSQL $TERRA_DB_VOLUME."
  if ((storage_data == 1)) || [[ -n "$backups" ]]; then
    terra_warn "Se detectaron documentos o backups previos. Crear una base vacía puede ocultar una pérdida de datos."
    if [[ -n "$backups" ]]; then
      terra_warn "Backups disponibles: $backups"
      terra_warn "Restaure primero con ./deploy/scripts/restore.sh $TERRA_ENV_SHORT <backup>."
    fi
    if [[ "$allow_empty" != "1" ]]; then
      terra_error "Autorice explícitamente con --allow-empty-db solo si acepta iniciar sin esos datos."
      exit 3
    fi
    terra_confirm "¿Confirma que desea crear una base vacía pese a existir datos/backups?" || exit 3
    if [[ "$TERRA_ENV_SHORT" == "prod" ]]; then
      terra_confirm "Autorización adicional de producción." "INIT PROD" || exit 3
    fi
  else
    terra_info "No se detectaron datos previos: es una instalación nueva."
    if [[ "$TERRA_ENV_SHORT" == "prod" ]]; then
      if [[ "$allow_empty" != "1" ]]; then
        terra_error "En producción, la creación de una base vacía requiere --allow-empty-db."
        exit 3
      fi
      terra_confirm "¿Confirma la inicialización de una base de datos vacía en PRODUCCIÓN?" "INIT PROD" || exit 3
    fi
  fi
fi
if ((volume_present == 1 && storage_data == 0)); then
  terra_warn "El volumen de base de datos existe pero el almacenamiento documental está vacío. Verifique si es esperado."
fi

# FASE 2 — Construcción
missing="$(terra_missing_images)"
if ((rebuild == 1)) || [[ -n "$missing" ]]; then
  if [[ -n "$missing" ]]; then
    terra_info "Imágenes faltantes: $missing"
  fi
  build_args=("$TERRA_ENV_SHORT" --skip-check)
  [[ "$no_cache" == "1" ]] && build_args+=(--no-cache)
  bash "$TERRA_SCRIPT_DIR/build.sh" "${build_args[@]}"
else
  terra_ok "Imágenes disponibles; se reutilizan (use --rebuild para reconstruir)."
fi

# FASE 3 — PostgreSQL
terra_step "Iniciando PostgreSQL"
terra_compose up -d db
terra_wait_healthy db 240
user="$(terra_env_get POSTGRES_USER)"
db="$(terra_env_get POSTGRES_DB)"
if ! terra_compose exec -T db pg_isready -U "$user" -d "$db" >/dev/null 2>&1; then
  terra_error "PostgreSQL no acepta conexiones."
  terra_error "Consulte: ./deploy/scripts/logs.sh $TERRA_ENV_SHORT db"
  exit 1
fi
if ! terra_db_psql "SELECT 1;" >/dev/null 2>&1; then
  terra_error "No fue posible ejecutar una consulta de prueba en PostgreSQL."
  exit 1
fi
terra_ok "PostgreSQL saludable y aceptando consultas"

# FASE 4 — API y migraciones
terra_step "Iniciando API y aplicando migraciones"
terra_compose up -d api
terra_wait_healthy api 300
terra_info "Verificando migraciones dentro del contenedor api…"
if ! terra_compose exec -T api /app/migrate; then
  terra_error "Las migraciones fallaron. No se continuará."
  terra_error "Consulte: ./deploy/scripts/logs.sh $TERRA_ENV_SHORT api"
  exit 1
fi
migrations="$(terra_db_psql "SELECT count(*) FROM schema_migrations;" 2>/dev/null || true)"
if [[ ! "$migrations" =~ ^[0-9]+$ ]] || ((migrations == 0)); then
  terra_error "No se detectaron migraciones aplicadas."
  exit 1
fi
terra_ok "Migraciones aplicadas: $migrations"

# FASE 5 — Bootstrap
terra_step "Ejecutando bootstrap administrativo (idempotente)"
if ! terra_compose exec -T api /app/bootstrap; then
  terra_error "El bootstrap falló. No se crearán credenciales nuevas a la fuerza."
  terra_error "Revise la configuración BOOTSTRAP_ADMIN_* y los logs de api."
  exit 1
fi
admins="$(terra_db_psql "SELECT count(*) FROM local_credentials;" 2>/dev/null || true)"
if [[ ! "$admins" =~ ^[0-9]+$ ]] || ((admins == 0)); then
  terra_error "No existe ningún administrador local después del bootstrap."
  exit 1
fi
terra_ok "Administrador local verificado"

# FASE 6 — Worker y web
terra_step "Iniciando worker y web"
terra_compose up -d worker web
terra_wait_healthy worker 180
terra_wait_healthy web 120
terra_ok "Worker y web activos"

# FASE 7 — Verificación final
if ! terra_verify_stack; then
  terra_error "La inicialización terminó con fallos. Los servicios se dejan activos para diagnóstico."
  terra_error "Ejecute ./deploy/scripts/status.sh $TERRA_ENV_SHORT y ./deploy/scripts/logs.sh $TERRA_ENV_SHORT."
  exit 1
fi

terra_print_summary "TERRA INITIALIZATION" 1
terra_ok "Inicialización completada. Los datos persistentes fueron conservados."
