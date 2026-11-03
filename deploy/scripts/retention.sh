#!/usr/bin/env bash
# =============================================================================
# TERRA - retention.sh
# Versión: 2.0.0
# Descripción: aplica retención de snapshots antiguos. Dry-run por defecto.
# Uso: ./deploy/scripts/retention.sh <dev|prod> [--apply]
# Requisitos: RETENTION_DAYS > 0, PostgreSQL activo y almacenamiento accesible.
# Efectos: con --apply elimina snapshots completados/fallidos antiguos y sus
#          filas asociadas. Nunca se ejecuta desde el arranque normal.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 cancelado.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

if (($# == 0)); then terra_usage_env retention.sh; exit 2; fi
terra_parse_environment "$1"
shift
apply=0
while (($# > 0)); do
  case "$1" in
    --apply) apply=1 ;;
    -h|--help) terra_usage_env retention.sh; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; exit 2 ;;
  esac
  shift
done

terra_check_env_file
days="$(terra_env_get RETENTION_DAYS)"
if [[ ! "$days" =~ ^[0-9]+$ ]] || ((days <= 0)); then
  terra_ok "RETENTION_DAYS=$days: retención desactivada."
  exit 0
fi

terra_check_commands
terra_require_db_running
storage_path="$(terra_storage_path)"
[[ -d "$storage_path" ]] || terra_die "No existe el almacenamiento: $storage_path"

sql="SELECT j.id, COALESCE(regexp_replace(min(i.relative_path), '(job-[0-9a-f-]+/Mi unidad/).*\$', '\\1'), '')
  FROM download_jobs j LEFT JOIN download_items i ON i.job_id = j.id
  WHERE j.status IN ('completed','partially_completed','failed','cancelled')
    AND COALESCE(j.finished_at, j.created_at) < now() - make_interval(days => $days)
  GROUP BY j.id ORDER BY j.id"

terra_step "Snapshots elegibles para retención (${days} días)"
terra_db_psql "$sql"

if [[ "$apply" != "1" ]]; then
  terra_info "Dry-run. Use --apply (y CONFIRM=yes si no hay terminal) para eliminar."
  exit 0
fi
terra_confirm "¿Eliminar definitivamente estos snapshots y sus archivos?" || exit 3

deleted=0
while IFS='|' read -r job_id prefix; do
  [[ -z "$job_id" ]] && continue
  if [[ -n "$prefix" ]]; then
    if [[ "$prefix" != areas/* || "$prefix" == *".."* ]]; then
      terra_error "Ruta de snapshot insegura para $job_id; se omite."
      continue
    fi
    target="$storage_path/${prefix%/}"
    target="${target%/Mi unidad}"
    if [[ "$target" == "$storage_path/areas/"* ]]; then
      rm -rf -- "$target"
    else
      terra_error "Ruta fuera del almacenamiento: $target; se omite."
      continue
    fi
  fi
  user="$(terra_env_get POSTGRES_USER)"
  db="$(terra_env_get POSTGRES_DB)"
  terra_compose exec -T db psql -U "$user" -d "$db" -v ON_ERROR_STOP=1 -c \
    "BEGIN; DELETE FROM stored_files WHERE job_id = '$job_id'; DELETE FROM download_items WHERE job_id = '$job_id'; DELETE FROM job_events WHERE job_id = '$job_id'; DELETE FROM download_job_roots WHERE job_id = '$job_id'; DELETE FROM download_jobs WHERE id = '$job_id'; COMMIT;" \
    >/dev/null
  deleted=$((deleted + 1))
done < <(terra_db_psql "$sql")

terra_ok "Snapshots eliminados: $deleted"
