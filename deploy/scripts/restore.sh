#!/usr/bin/env bash
# =============================================================================
# TERRA - restore.sh
# Versión: 1.0.0
# Descripción: restaura PostgreSQL y/o el volumen documental desde un backup.
# Uso: ./deploy/scripts/restore.sh <dev|prod> <backup-dir> [--db|--storage|--all]
# Requisitos: backup verificado y confirmación explícita.
# Efectos: DESTRUCTIVO sobre los datos indicados. Detiene servicios, restaura y
#          vuelve a arrancar. No borra el backup ni otros datos.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 cancelado/no autorizado.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: restore.sh <dev|prod> <backup-dir> [--db|--storage|--all]

  --db       restaura solo PostgreSQL
  --storage  restaura solo el volumen documental
  --all      restaura ambos (por defecto)

Antes de restaurar se verifican checksums, entorno e integridad del backup.
Se exige CONFIRM=yes. En producción se exige además CONFIRM_PROD="RESTORE PROD".

La restauración de PostgreSQL usa pg_restore --clean --if-exists. Sustituye el
esquema y los datos actuales. El backup no se elimina.
EOF
}

if (($# < 2)); then usage; exit 2; fi
terra_parse_environment "$1"
backup_dir="$2"
shift 2
restore_db=1
restore_storage=1
mode="all"
if (($# > 0)); then
  case "$1" in
    --db) restore_db=1; restore_storage=0; mode="db" ;;
    --storage) restore_db=0; restore_storage=1; mode="storage" ;;
    --all) restore_db=1; restore_storage=1; mode="all" ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
fi
[[ $# -eq 0 ]] || { terra_error "Argumentos extra no permitidos."; exit 2; }

[[ -d "$backup_dir" ]] || terra_die "No existe el directorio de backup: $backup_dir"
backup_dir="$(cd -- "$backup_dir" && pwd)"
terra_check_env_file
terra_check_commands
terra_require_db_running

if [[ -f "$backup_dir/metadata.json" ]]; then
  if ! grep -q "\"environment\": \"$TERRA_ENV\"" "$backup_dir/metadata.json"; then
    terra_error "El backup no corresponde al ambiente $TERRA_ENV."
    exit 3
  fi
else
  terra_error "El backup no contiene metadata.json; no se puede verificar el ambiente."
  exit 3
fi

if [[ -f "$backup_dir/SHA256SUMS" ]]; then
  (cd "$backup_dir" && sha256sum -c SHA256SUMS >/dev/null) || terra_die "Checksums inválidos; restauración cancelada."
else
  terra_die "El backup no contiene SHA256SUMS; restauración cancelada."
fi

dump="$backup_dir/terra.dump"
archive="$backup_dir/storage.tar.gz"
[[ -f "$dump.gpg" ]] && dump="$dump.gpg"
[[ -f "$archive.gpg" ]] && archive="$archive.gpg"

if ((restore_db == 1)); then
  [[ -f "$dump" ]] || terra_die "No se encontró terra.dump o terra.dump.gpg en $backup_dir."
fi
if ((restore_storage == 1)); then
  [[ -f "$archive" ]] || terra_die "No se encontró storage.tar.gz o storage.tar.gz.gpg en $backup_dir."
  if [[ "$archive" != *.gpg ]]; then
    tar tzf "$archive" >/dev/null 2>&1 || terra_die "El archivo de almacenamiento no es válido."
  fi
fi

storage_path="$(terra_storage_path)"
required_bytes="$(du -sb -- "$backup_dir" 2>/dev/null | awk '{print $1}')"
space_dir="$storage_path"
while [[ ! -d "$space_dir" ]]; do space_dir="$(dirname "$space_dir")"; done
available_bytes="$(df --output=avail -B1 "$space_dir" 2>/dev/null | tail -1 | tr -d ' ')"
if [[ "$required_bytes" =~ ^[0-9]+$ && "$available_bytes" =~ ^[0-9]+$ ]] && ((required_bytes > available_bytes)); then
  terra_error "Espacio insuficiente: el backup ocupa $required_bytes bytes y hay $available_bytes disponibles en $space_dir."
  exit 1
fi

printf '\nRestauración solicitada:\n'
printf '  Ambiente: %s\n  Backup: %s\n  Componentes: %s\n' "$TERRA_ENV" "$backup_dir" "$mode"
if ((restore_db == 1)); then printf '  PostgreSQL: SÍ\n'; else printf '  PostgreSQL: no\n'; fi
if ((restore_storage == 1)); then
  printf '  Almacenamiento: SÍ (%s)\n' "$storage_path"
else
  printf '  Almacenamiento: no\n'
fi
printf '  Tamaño del backup: %s\n\n' "$(terra_file_size "$backup_dir")"

terra_confirm "Esta operación sustituirá los datos indicados. ¿Continuar?" || {
  terra_error "Restauración cancelada."
  exit 3
}
if [[ "$TERRA_ENV_SHORT" == "prod" ]]; then
  terra_confirm "Autorización adicional de producción." "RESTORE PROD" || {
    terra_error "Restauración cancelada."
    exit 3
  }
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/terra-restore.XXXXXX")"
chmod 700 "$tmpdir"
cleanup() { rm -rf -- "$tmpdir"; }
trap cleanup EXIT

if [[ "$dump" == *.gpg ]]; then
  command -v gpg >/dev/null 2>&1 || terra_die "Backup cifrado y gpg no disponible."
  gpg --batch --yes --decrypt --output "$tmpdir/terra.dump" "$dump"
  dump="$tmpdir/terra.dump"
fi
if ((restore_storage == 1)) && [[ "$archive" == *.gpg ]]; then
  command -v gpg >/dev/null 2>&1 || terra_die "Backup cifrado y gpg no disponible."
  gpg --batch --yes --decrypt --output "$tmpdir/storage.tar.gz" "$archive"
  archive="$tmpdir/storage.tar.gz"
fi

terra_step "Deteniendo web, api y worker"
terra_compose stop web api worker >/dev/null

if ((restore_db == 1)); then
  terra_step "Restaurando PostgreSQL"
  user="$(terra_env_get POSTGRES_USER)"
  db="$(terra_env_get POSTGRES_DB)"
  if ! terra_compose exec -T db pg_restore -U "$user" -d "$db" --clean --if-exists --no-owner < "$dump"; then
    terra_error "La restauración de PostgreSQL falló. No se eliminó el backup."
    terra_error "Los servicios permanecen detenidos; revise los logs y reintente."
    exit 1
  fi
  terra_ok "PostgreSQL restaurado."
fi

if ((restore_storage == 1)); then
  terra_step "Restaurando volumen documental"
  mkdir -p -- "$storage_path"
  if ! tar xzf "$archive" -C "$storage_path"; then
    terra_error "La restauración del volumen falló. No se eliminó el backup."
    exit 1
  fi
  if [[ "$TERRA_ENV_SHORT" == "prod" ]]; then
    if [[ "$(id -u)" == "0" ]]; then
      chown -R 10001:10001 -- "$storage_path"
    else
      terra_warn "Verifique que $storage_path pertenezca a 10001:10001."
    fi
  fi
  terra_ok "Volumen documental restaurado."
fi

terra_step "Reiniciando servicios"
terra_compose up -d db >/dev/null
terra_wait_healthy db 240
terra_compose up -d api worker web >/dev/null
for service in api worker web; do terra_wait_healthy "$service" 240; done

if ! terra_verify_stack; then
  terra_error "La restauración terminó, pero la verificación final falló."
  terra_error "No elimine el backup. Revise logs antes de reintentar."
  exit 1
fi

if ((restore_db == 1 && restore_storage == 1)); then
  terra_step "Comprobando consistencia base de datos / almacenamiento"
  missing=0
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    if [[ ! -f "$storage_path/$rel" ]]; then
      terra_error "Falta en disco: $rel"
      missing=$((missing + 1))
    fi
  done < <(terra_db_psql "SELECT relative_path FROM stored_files WHERE status='completed' ORDER BY relative_path;" 2>/dev/null || true)
  if ((missing > 0)); then
    terra_error "Faltan $missing archivo(s) del backup. Revise el backup y el almacenamiento."
    exit 1
  fi
  terra_ok "Consistencia verificada."
fi

terra_ok "Restauración completada. El backup se conserva en $backup_dir."
terra_warn "Si TOKEN_ENCRYPTION_KEY no coincide con la del backup, los trabajadores deberán reconectar Google Drive."
