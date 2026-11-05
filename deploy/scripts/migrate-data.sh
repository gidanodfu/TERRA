#!/usr/bin/env bash
# =============================================================================
# TERRA - migrate-data.sh
# Versión: 2.0.0
# Descripción: migra documentos y copias de seguridad del repositorio a las
#              rutas externas configuradas, con copia y verificación previas.
# Uso: ./deploy/scripts/migrate-data.sh [--dry-run|--apply] [--yes]
# Requisitos: Docker, Compose, .env y .env con permisos restrictivos.
# Efectos: con --apply copia datos, actualiza .env de forma atómica y recrea
#          api/worker. NUNCA elimina el origen.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 cancelado.
# =============================================================================
set -Eeuo pipefail
umask 077
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: migrate-data.sh [--dry-run|--apply] [--yes]

Sin opciones muestra la simulación. --apply exige confirmación salvo --yes.

Orígenes heredados:
  data/dev/   (documentos)
  backups/    (copias de seguridad)

Destinos: STORAGE_HOST_PATH y BACKUP_HOST_PATH de .env, o sus valores
predeterminados en $XDG_DATA_HOME/terra o $HOME/.local/share/terra.

La migración copia, verifica y actualiza .env; nunca borra el origen.
USAGE
}

mode="dry-run"
assume_yes=0
while (($# > 0)); do
  case "$1" in
    --dry-run) mode="dry-run" ;;
    --apply) mode="apply" ;;
    --yes) assume_yes=1 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

legacy_storage="$TERRA_ROOT_DIR/data/dev"
legacy_backups="$TERRA_ROOT_DIR/backups"

# Destino nuevo: respeta rutas externas personalizadas; una ruta relativa solo se
# acepta si es la ubicación heredada, en cuyo caso se resuelve el predeterminado.
resolve_destination() {
  local key="$1" default_sub="$2" legacy="$3" label="$4" raw data_home
  raw="$(terra_env_get "$key")"
  if [[ -n "$raw" ]]; then
    if [[ "$raw" != /* ]]; then
      if [[ "$(realpath -m -- "$TERRA_ROOT_DIR/$raw")" == "$(realpath -m -- "$legacy")" ||
            "$(realpath -m -- "$TERRA_DEPLOY_DIR/$raw")" == "$(realpath -m -- "$legacy")" ]]; then
        raw=""
      else
        terra_error "$label relativa no permitida: $raw"
        return 1
      fi
    elif [[ "$(realpath -m -- "$raw")" == "$(realpath -m -- "$legacy")" ]]; then
      raw=""
    fi
  fi
  if [[ -z "$raw" ]]; then
    if ! data_home="$(terra_default_data_home)"; then
      terra_error "Defina $key en .env: no se pudo determinar XDG_DATA_HOME ni HOME."
      return 1
    fi
    raw="$data_home/$default_sub"
  fi
  terra_canonical_external "$raw" "$label"
}

storage_dest="$(resolve_destination STORAGE_HOST_PATH storage "$legacy_storage" STORAGE_HOST_PATH)" || exit 1
backups_dest="$(resolve_destination BACKUP_HOST_PATH backups "$legacy_backups" BACKUP_HOST_PATH)" || exit 1
if [[ "$storage_dest" == "$backups_dest" || "$storage_dest" == "$backups_dest/"* || "$backups_dest" == "$storage_dest/"* ]]; then
  terra_error "Los destinos documental y de backups no pueden coincidir ni estar anidados."
  exit 1
fi

tree_stats() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    printf '0 0'
    return 0
  fi
  find "$dir" -type f -printf '%s\n' 2>/dev/null | awk '{n++; s+=$1} END {printf "%d %d", n+0, s+0}'
}

read -r storage_files storage_bytes <<<"$(tree_stats "$legacy_storage")"
read -r backup_files backup_bytes <<<"$(tree_stats "$legacy_backups")"
total_bytes=$((storage_bytes + backup_bytes))

dir_has_entries() {
  local dir="$1"
  [[ -d "$dir" ]] || return 1
  [[ -n "$(find "$dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]]
}

conflicts=0
if dir_has_entries "$storage_dest"; then
  terra_error "El destino documental ya contiene datos: $storage_dest"
  conflicts=$((conflicts + 1))
fi
if dir_has_entries "$backups_dest"; then
  terra_error "El destino de backups ya contiene datos: $backups_dest"
  conflicts=$((conflicts + 1))
fi

# Copias heredadas: directorios con metadata.json en el primer o segundo nivel.
declare -a backup_names=()
declare -a backup_sources=()
if [[ -d "$legacy_backups" ]]; then
  for entry in "$legacy_backups"/*; do
    [[ -d "$entry" ]] || continue
    if [[ -f "$entry/metadata.json" ]]; then
      backup_names+=("$(basename "$entry")")
      backup_sources+=("$entry")
      continue
    fi
    for nested in "$entry"/*; do
      [[ -d "$nested" && -f "$nested/metadata.json" ]] || continue
      backup_names+=("$(basename "$nested")")
      backup_sources+=("$nested")
    done
  done
fi
for name in "${backup_names[@]}"; do
  if [[ -e "$backups_dest/$name" ]]; then
    terra_error "Ya existe un backup con el mismo nombre: $backups_dest/$name"
    conflicts=$((conflicts + 1))
  fi
done

available_bytes=""
for dest in "$storage_dest" "$backups_dest"; do
  probe="$dest"
  while [[ ! -d "$probe" ]]; do probe="$(dirname "$probe")"; done
  avail="$(df --output=avail -B1 "$probe" 2>/dev/null | tail -1 | tr -d ' ')"
  if [[ ! "$avail" =~ ^[0-9]+$ ]]; then
    terra_error "No se pudo determinar el espacio libre en $probe."
    exit 1
  fi
  if [[ -z "$available_bytes" ]] || ((avail < available_bytes)); then
    available_bytes="$avail"
  fi
done
required_bytes=$((total_bytes + total_bytes / 20))

printf '\nMigración de datos TERRA (modo: %s)\n\n' "$mode"
printf 'Documentos\n  Origen:  %s\n  Destino: %s\n  Archivos: %s · bytes: %s\n' \
  "$legacy_storage" "$storage_dest" "$storage_files" "$storage_bytes"
printf 'Backups\n  Origen:  %s\n  Destino: %s\n  Archivos: %s · bytes: %s\n' \
  "$legacy_backups" "$backups_dest" "$backup_files" "$backup_bytes"
printf '  Copias detectadas: %s\n' "${#backup_names[@]}"
printf 'Espacio: requerido %s bytes (5%% margen) · disponible %s bytes\n' "$required_bytes" "$available_bytes"
printf 'Conflictos: %s\n\n' "$conflicts"

if ((conflicts > 0)); then
  terra_error "Resuelva los conflictos antes de migrar; no se modificó nada."
  exit 1
fi
if ((required_bytes > available_bytes)); then
  terra_error "Espacio insuficiente; no se modificó nada."
  exit 1
fi
if [[ "$mode" == "dry-run" ]]; then
  terra_info "Simulación completada. Use --apply para copiar y actualizar .env."
  exit 0
fi

if [[ "$assume_yes" != "1" ]]; then
  terra_confirm "¿Copiar los datos a las rutas externas y actualizar .env? El origen se conserva." || {
    terra_error "Migración cancelada."
    exit 3
  }
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/terra-migrate.XXXXXX")"
chmod 700 "$tmpdir"
worker_stopped=0
config_updated=0
success=0
cleanup() {
  if [[ "$success" != "1" ]]; then
    if [[ "$config_updated" == "1" ]]; then
      terra_compose up -d --force-recreate api worker >/dev/null 2>&1 || true
    elif [[ "$worker_stopped" == "1" ]]; then
      terra_compose start worker >/dev/null 2>&1 || true
    fi
  fi
  rm -rf -- "$tmpdir"
}
trap cleanup EXIT

terra_step "Deteniendo el worker"
if [[ -n "$(terra_service_container worker)" ]]; then
  terra_compose stop worker >/dev/null
  worker_stopped=1
fi

terra_step "Creando destinos"
terra_make_dir "$storage_dest" 0750
terra_make_dir "$storage_dest/staging" 0750
terra_make_dir "$storage_dest/areas" 0750
terra_make_dir "$backups_dest" 0700

verify_tree() {
  local src="$1" dst="$2" label="$3"
  ( cd "$src" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum ) > "$tmpdir/src.sums"
  ( cd "$dst" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum ) > "$tmpdir/dst.sums"
  if ! diff -q "$tmpdir/src.sums" "$tmpdir/dst.sums" >/dev/null; then
    terra_error "La verificación SHA-256 falló para $label."
    return 1
  fi
  read -r src_n src_bytes <<<"$(tree_stats "$src")"
  read -r dst_n dst_bytes <<<"$(tree_stats "$dst")"
  if [[ "$src_n" != "$dst_n" || "$src_bytes" != "$dst_bytes" ]]; then
    terra_error "Conteo o tamaño distinto para $label ($src_n/$src_bytes vs $dst_n/$dst_bytes)."
    return 1
  fi
  terra_ok "$label verificado: $dst_n archivos · $dst_bytes bytes"
}

if [[ -d "$legacy_storage" ]]; then
  terra_step "Copiando almacenamiento documental"
  cp -a "$legacy_storage/." "$storage_dest/"
  verify_tree "$legacy_storage" "$storage_dest" "almacenamiento documental"
fi

for i in "${!backup_names[@]}"; do
  name="${backup_names[$i]}"
  src="${backup_sources[$i]}"
  terra_step "Copiando backup $name"
  cp -a "$src" "$backups_dest/$name"
  verify_tree "$src" "$backups_dest/$name" "backup $name"
  find "$backups_dest/$name" -type d -exec chmod 700 {} +
  find "$backups_dest/$name" -type f -exec chmod 600 {} +
done

terra_step "Actualizando .env de forma atómica"
env_mode="$(stat -c '%a' "$TERRA_ENV_FILE")"
env_backup="$backups_dest/.env-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p -- "$TERRA_ENV_FILE" "$env_backup"
tmp_env="$TERRA_ENV_FILE.tmp.$$"
awk -v storage="$storage_dest" -v backups="$backups_dest" '
  BEGIN { seen_storage = 0; seen_backups = 0 }
  /^STORAGE_HOST_PATH=/ { print "STORAGE_HOST_PATH=" storage; seen_storage = 1; next }
  /^BACKUP_HOST_PATH=/ { print "BACKUP_HOST_PATH=" backups; seen_backups = 1; next }
  { print }
  END {
    if (!seen_storage) print "STORAGE_HOST_PATH=" storage
    if (!seen_backups) print "BACKUP_HOST_PATH=" backups
  }
' "$TERRA_ENV_FILE" > "$tmp_env"
chmod "$env_mode" "$tmp_env"
mv -f -- "$tmp_env" "$TERRA_ENV_FILE"
config_updated=1
terra_ok "Rutas actualizadas en .env (copia previa: $env_backup)"

terra_step "Recreando API y worker con el nuevo montaje"
terra_compose up -d --force-recreate api worker >/dev/null
for service in api worker; do terra_wait_healthy "$service" 240; done

terra_step "Comprobando consistencia"
if bash "$TERRA_SCRIPT_DIR/consistency-check.sh" > "$tmpdir/consistency.log" 2>&1; then
  terra_ok "PostgreSQL y almacenamiento son consistentes."
else
  missing="$(grep -o 'Archivos faltantes: [0-9]*' "$tmpdir/consistency.log" | tail -1 | awk '{print $3}')"
  terra_warn "Consistencia con incidencias: archivos faltantes=${missing:-?}."
  terra_warn "Estas ausencias pueden ser previas a la migración; el origen se conserva en $legacy_storage."
fi

success=1
printf '\n'
terra_ok "Migración completada sin borrar el origen."
terra_info "Documentos: $storage_dest"
terra_info "Backups:   $backups_dest"
terra_info "Origen conservado: $legacy_storage y $legacy_backups"
terra_warn "Elimine manualmente los directorios antiguos solo tras validar la nueva ubicación."
