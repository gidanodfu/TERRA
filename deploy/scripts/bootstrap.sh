#!/usr/bin/env bash
# =============================================================================
# TERRA - bootstrap.sh
# Versión: 1.0.0
# Descripción: ejecuta el bootstrap administrativo idempotente dentro de api.
# Uso: ./deploy/scripts/bootstrap.sh <dev|prod>
# Requisitos: PostgreSQL y API activos; migraciones aplicadas.
# Efectos: crea el primer administrador solo si no existe. No sobrescribe
#          credenciales ni modifica datos existentes.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: bootstrap.sh <dev|prod>

Comprueba base de datos, migraciones, almacenamiento y estado del administrador
inicial. Es idempotente: ejecutarlo varias veces no duplica ni sobrescribe nada.
EOF
}

if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift
while (($# > 0)); do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_check_env_file
terra_check_commands
terra_require_db_running
terra_require_api_running

migrations="$(terra_db_psql "SELECT count(*) FROM schema_migrations;" 2>/dev/null || echo '0')"
if [[ ! "$migrations" =~ ^[0-9]+$ ]] || ((migrations == 0)); then
  terra_error "No hay migraciones aplicadas. Ejecute ./deploy/scripts/migrate.sh $TERRA_ENV_SHORT up."
  exit 1
fi

storage_path="$(terra_storage_path)"
if [[ ! -d "$storage_path" ]]; then
  terra_error "El almacenamiento no está disponible: $storage_path"
  exit 1
fi

terra_step "Ejecutando bootstrap administrativo"
terra_compose exec -T api /app/bootstrap

admins="$(terra_db_psql "SELECT count(*) FROM local_credentials;" 2>/dev/null || echo '0')"
if [[ "$admins" =~ ^[0-9]+$ ]] && ((admins > 0)); then
  terra_ok "Bootstrap verificado: existe al menos un administrador local."
else
  terra_error "No existe ningún administrador local. Verifique BOOTSTRAP_ADMIN_USERNAME y BOOTSTRAP_ADMIN_PASSWORD."
  exit 1
fi
terra_ok "Bootstrap completado sin sobrescribir credenciales."
