#!/usr/bin/env bash
# =============================================================================
# TERRA - down.sh
# Versión: 2.0.0
# Descripción: detiene TERRA sin eliminar datos persistentes.
# Uso: ./deploy/scripts/down.sh [--remove]
# Efectos: stop o eliminación de contenedores/red sin -v. Nunca borra volúmenes.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: down.sh [--remove]

Sin opciones detiene los contenedores. --remove los elimina y elimina la red,
conservando SIEMPRE el volumen PostgreSQL y los documentos del host.
USAGE
}

remove=0
while (($# > 0)); do
  case "$1" in
    --remove) remove=1 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_check_env_file
terra_check_commands
volume_before=0
if terra_volume_exists; then volume_before=1; fi

if [[ "$remove" == "1" ]]; then
  terra_step "Eliminando contenedores y red (sin volúmenes)"
  terra_compose down --remove-orphans
else
  terra_step "Deteniendo contenedores"
  terra_compose stop
fi

if ((volume_before == 1)); then
  terra_volume_exists || terra_die "El volumen PostgreSQL desapareció. Revise backups."
  terra_ok "Volumen PostgreSQL conservado: $TERRA_DB_VOLUME"
fi
storage_path="$(terra_storage_path)"
[[ -d "$storage_path" ]] && terra_ok "Almacenamiento conservado: $storage_path"
terra_ok "TERRA detenido. No se eliminaron datos."
