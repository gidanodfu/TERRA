#!/usr/bin/env bash
# =============================================================================
# TERRA - check.sh
# Versión: 1.0.0
# Descripción: valida Docker, Compose, configuración, archivos, servicios y
#              almacenamiento antes de construir o arrancar TERRA.
# Uso: ./deploy/scripts/check.sh <dev|prod> [--for-init] [-q]
# Requisitos: Docker Engine, Docker Compose v2, curl, coreutils.
# Efectos: solo lectura. No crea contenedores, volúmenes ni directorios.
# Códigos: 0 válido · 1 entorno no preparado · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: check.sh <dev|prod> [opciones]

Comprueba que el entorno esté preparado para construir y ejecutar TERRA.
No imprime valores de .env.

Opciones:
  --for-init   exige también las variables del bootstrap inicial
  -q, --quiet  reduce la salida a errores y resumen
  -h, --help   muestra esta ayuda

Códigos de salida: 0 correcto, 1 entorno no preparado, 2 uso incorrecto.
EOF
}

quiet=0
for_init=0
if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift
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

step "Validando entorno ($TERRA_ENV_SHORT)"
if ! terra_check_env_file; then exit 1; fi
if ! terra_check_commands; then exit 1; fi
ok "Docker y Docker Compose disponibles"

step "Validando archivos del proyecto"
if ! terra_validate_files; then exit 1; fi
ok "Dockerfiles, Compose, Nginx y ejemplos presentes"

step "Validando variables obligatorias"
if ! terra_check_required_vars "$for_init"; then
  terra_error "La configuración está incompleta. Corrija las variables indicadas y reintente."
  exit 1
fi
ok "Variables obligatorias y claves con formato válido"

step "Validando Docker Compose"
if ! terra_validate_compose; then exit 1; fi
ok "Compose válido con exactamente cuatro servicios: web, api, worker, db"

step "Validando almacenamiento persistente"
storage_path="$(terra_storage_path)"
if [[ -e "$storage_path" ]]; then
  [[ -d "$storage_path" ]] || { terra_error "$storage_path existe pero no es un directorio."; exit 1; }
  if [[ "$TERRA_ENV_SHORT" == "prod" ]]; then
    wrong_owner="$(find "$storage_path" \( ! -user 10001 -o ! -group 10001 \) -print -quit 2>/dev/null || true)"
    if [[ -n "$wrong_owner" ]]; then
      terra_error "Producción: el volumen documental debe pertenecer a 10001:10001."
      terra_error "Ejecute: sudo chown -R 10001:10001 '$storage_path'"
      exit 1
    fi
    ok "Almacenamiento de producción accesible por UID/GID 10001: $storage_path"
  else
    [[ -w "$storage_path" ]] || {
      terra_error "El directorio $storage_path no es escribible por el usuario actual."
      exit 1
    }
    ok "Almacenamiento accesible: $storage_path"
  fi
else
  parent="$storage_path"
  while [[ ! -d "$parent" ]]; do parent="$(dirname "$parent")"; done
  if [[ ! -w "$parent" ]]; then
    terra_error "No se puede crear el almacenamiento $storage_path (sin escritura en $parent)."
    if [[ "$TERRA_ENV_SHORT" == "prod" ]]; then
      terra_error "Ejecute: sudo mkdir -p '$storage_path/{staging,areas}' && sudo chown -R 10001:10001 '$storage_path'"
    fi
    exit 1
  fi
  ok "Almacenamiento aún no existe; se creará en $storage_path"
fi

step "Validando capacidad de disco"
min_free="$(terra_env_get MIN_FREE_DISK_BYTES)"
min_free="${min_free:-0}"
check_dir="$storage_path"
while [[ ! -d "$check_dir" ]]; do check_dir="$(dirname "$check_dir")"; done
available="$(df --output=avail -B1 "$check_dir" 2>/dev/null | tail -1 | tr -d ' ')"
if [[ "$min_free" =~ ^[0-9]+$ && "$available" =~ ^[0-9]+$ ]] && ((available < min_free)); then
  terra_error "Espacio libre insuficiente: $available bytes disponibles, mínimo configurado $min_free."
  exit 1
fi
ok "Espacio libre suficiente para el mínimo configurado"

if [[ -n "$(terra_backups_for_env)" ]]; then
  ok "Backups previos detectados para $TERRA_ENV_SHORT"
fi

printf '\n%s[TERRA]%s Entorno validado correctamente (%s).\n' "$TERRA_C_GREEN" "$TERRA_C_RESET" "$TERRA_ENV_SHORT"
