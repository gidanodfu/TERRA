#!/usr/bin/env bash
# =============================================================================
# TERRA - check.sh
# Versión: 2.0.0
# Descripción: valida Docker, Compose, .env, archivos, servicios y almacenamiento
#              antes de construir o inicializar el entorno local.
# Uso: ./deploy/scripts/check.sh [--for-init] [-q]
# Requisitos: Docker Engine, Docker Compose v2, curl y utilidades base.
# Efectos: solo lectura. No crea contenedores, volúmenes ni directorios.
# Códigos: 0 válido · 1 entorno no preparado · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: check.sh [--for-init] [-q]

Comprueba Docker, Compose, .env, variables obligatorias, archivos, servicios
exactos, almacenamiento, base de datos y espacio libre. No imprime secretos.

Opciones:
  --for-init   exige también las variables del bootstrap inicial
  -q, --quiet  reduce la salida
  -h, --help   muestra esta ayuda
USAGE
}

quiet=0
for_init=0
while (($# > 0)); do
  case "$1" in
    --for-init) for_init=1 ;;
    -q|--quiet) quiet=1 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

step() { [[ "$quiet" == "1" ]] || terra_step "$*"; }
ok()   { [[ "$quiet" == "1" ]] || terra_ok "$*"; }

step "Validando Docker y Compose"
if ! terra_check_env_file; then exit 1; fi
if ! terra_check_commands; then exit 1; fi
ok "Docker y Docker Compose disponibles"

step "Validando archivos del proyecto"
if ! terra_validate_files; then exit 1; fi
ok "Dockerfiles, Compose y .env.example presentes"

step "Validando variables obligatorias"
if ! terra_check_required_vars "$for_init"; then
  terra_error "La configuración local está incompleta. Corrija las variables indicadas."
  exit 1
fi
ok "Variables y claves con formato válido"

step "Validando Docker Compose"
if ! terra_validate_compose; then exit 1; fi
ok "Compose válido con exactamente cuatro servicios: web, api, worker, db"

step "Validando almacenamiento local"
storage_path="$(terra_storage_path)"
if [[ -e "$storage_path" ]]; then
  [[ -d "$storage_path" ]] || { terra_error "$storage_path no es un directorio."; exit 1; }
  [[ -w "$storage_path" ]] || { terra_error "Sin permisos de escritura en $storage_path."; exit 1; }
  ok "Almacenamiento accesible: $storage_path"
else
  parent="$storage_path"
  while [[ ! -d "$parent" ]]; do parent="$(dirname "$parent")"; done
  [[ -w "$parent" ]] || { terra_error "No se puede crear $storage_path (sin escritura en $parent)."; exit 1; }
  ok "Almacenamiento aún no existe; se creará en $storage_path"
fi

step "Validando copias de seguridad externas"
backup_path="$(terra_backup_path)"
if [[ -e "$backup_path" ]]; then
  [[ -d "$backup_path" ]] || { terra_error "$backup_path no es un directorio."; exit 1; }
  [[ -w "$backup_path" ]] || { terra_error "Sin permisos de escritura en $backup_path."; exit 1; }
  ok "Copias de seguridad accesibles: $backup_path"
else
  parent="$backup_path"
  while [[ ! -d "$parent" ]]; do parent="$(dirname "$parent")"; done
  [[ -w "$parent" ]] || { terra_error "No se puede crear $backup_path (sin escritura en $parent)."; exit 1; }
  ok "Copias de seguridad aún no existen; se crearán en $backup_path"
fi

step "Validando capacidad de disco"
min_free="$(terra_env_get MIN_FREE_DISK_BYTES)"
min_free="${min_free:-0}"
check_dir="$storage_path"
while [[ ! -d "$check_dir" ]]; do check_dir="$(dirname "$check_dir")"; done
available="$(df --output=avail -B1 "$check_dir" 2>/dev/null | tail -1 | tr -d ' ')"
if [[ "$min_free" =~ ^[0-9]+$ && "$available" =~ ^[0-9]+$ ]] && ((available < min_free)); then
  terra_error "Espacio libre insuficiente: $available bytes, mínimo configurado $min_free."
  exit 1
fi
ok "Espacio libre suficiente"

if [[ -n "$(terra_backups)" ]]; then
  ok "Copias de seguridad locales previas detectadas"
fi

printf '\n%s[TERRA]%s Entorno local validado correctamente.\n' "$TERRA_C_GREEN" "$TERRA_C_RESET"
