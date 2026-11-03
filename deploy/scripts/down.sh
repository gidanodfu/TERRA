#!/usr/bin/env bash
# =============================================================================
# TERRA - down.sh
# Versión: 1.0.0
# Descripción: detiene TERRA de forma segura sin eliminar datos.
# Uso: ./deploy/scripts/down.sh <dev|prod> [--remove]
# Requisitos: Docker y configuración válida.
# Efectos: por defecto detiene contenedores. Con --remove los elimina y elimina
#          la red, pero NUNCA volúmenes ni documentos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: down.sh <dev|prod> [--remove]

Opciones:
  --remove    elimina los contenedores y la red del proyecto, conservando
              SIEMPRE los volúmenes y los documentos del host
  -h, --help  muestra esta ayuda

Diferencia importante:
  - detener: conserva contenedores para volver a iniciarlos
  - eliminar contenedores: los contenedores desaparecen, pero los volúmenes y
    los datos persistentes permanecen. Use up.sh o init.sh para recrearlos.
EOF
}

if (($# == 0)); then usage; exit 2; fi
terra_parse_environment "$1"
shift
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
  # Deliberadamente sin -v: los datos persistentes nunca se eliminan aquí.
  terra_compose down --remove-orphans
else
  terra_step "Deteniendo contenedores"
  terra_compose stop
fi

if ((volume_before == 1)); then
  if terra_volume_exists; then
    terra_ok "Volumen PostgreSQL conservado: $TERRA_DB_VOLUME"
  else
    terra_error "El volumen PostgreSQL ya no existe. Revise inmediatamente los backups."
    exit 1
  fi
fi
storage_path="$(terra_storage_path)"
if [[ -d "$storage_path" ]]; then
  terra_ok "Almacenamiento conservado: $storage_path"
fi
terra_ok "TERRA detenido. No se eliminaron datos."
