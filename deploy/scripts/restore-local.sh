#!/usr/bin/env bash
# =============================================================================
# TERRA - restore-local.sh
# Versión: 2.0.0
# Descripción: restaura PostgreSQL y/o el volumen documental local.
# Uso: ./deploy/scripts/restore-local.sh [backup-dir] [--db|--storage|--all]
# Requisitos: copia de seguridad verificada y confirmación explícita.
# Efectos: DESTRUCTIVO sobre los datos indicados. No elimina la copia de seguridad.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto · 3 cancelado.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: restore-local.sh [backup-dir] [--db|--storage|--all]

Sin directorio restaura la copia de seguridad local más reciente.
  --db       restaura solo PostgreSQL
  --storage  restaura solo el volumen documental
  --all      restaura ambos (por defecto)

Se exige CONFIRM=yes o confirmación interactiva. La copia de seguridad no se elimina.
USAGE
}

backup_dir=""
restore_db=1
restore_storage=1
mode="all"
while (($# > 0)); do
  case "$1" in
    --db) restore_db=1; restore_storage=0; mode="db" ;;
    --storage) restore_db=0; restore_storage=1; mode="storage" ;;
    --all) restore_db=1; restore_storage=1; mode="all" ;;
    -h|--help) usage; exit 0 ;;
    -*) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
    *) [[ -z "$backup_dir" ]] || { terra_error "Solo se permite un directorio."; exit 2; }; backup_dir="$1" ;;
  esac
  shift
done

if [[ -z "$backup_dir" ]]; then
  backup_root="$(terra_backup_path)"
  backup_dir="$(terra_backups "$backup_root" | tail -n1)"
  [[ -n "$backup_dir" ]] || terra_die "No hay copias de seguridad en $backup_root." 1
  backup_dir="$backup_root/$backup_dir"
  terra_info "Usando la copia de seguridad más reciente: $backup_dir"
fi
[[ -d "$backup_dir" ]] || terra_die "No existe el directorio de copia de seguridad: $backup_dir" 2
backup_dir="$(cd -- "$backup_dir" && pwd)"
terra_check_env_file
terra_check_commands
terra_require_db_running

[[ -f "$backup_dir/metadata.json" ]] || terra_die "Falta metadata.json; no se puede verificar la copia de seguridad." 3
grep -q '"application": "TERRA"' "$backup_dir/metadata.json" \
  || terra_die "La copia de seguridad no corresponde a TERRA." 3
if grep -q '"distribution":' "$backup_dir/metadata.json"; then
  grep -q '"distribution": "local-development"' "$backup_dir/metadata.json" \
    || terra_die "La copia de seguridad no corresponde a la distribución local." 3
else
  terra_warn "Copia heredada sin marca de distribución; se validarán checksums y contenido."
fi
[[ -f "$backup_dir/SHA256SUMS" ]] || terra_die "Falta SHA256SUMS." 3
(cd "$backup_dir" && sha256sum -c SHA256SUMS >/dev/null) || terra_die "Checksums inválidos." 3

dump="$backup_dir/terra.dump"
archive="$backup_dir/storage.tar.gz"
[[ -f "$dump.gpg" ]] && dump="$dump.gpg"
[[ -f "$archive.gpg" ]] && archive="$archive.gpg"
if ((restore_db == 1)); then [[ -f "$dump" ]] || terra_die "Falta terra.dump o terra.dump.gpg." 3; fi
if ((restore_storage == 1)); then
  [[ -f "$archive" ]] || terra_die "Falta storage.tar.gz o storage.tar.gz.gpg." 3
  if [[ "$archive" != *.gpg ]]; then
    tar tzf "$archive" >/dev/null 2>&1 || terra_die "El archivo de almacenamiento no es válido." 3
  fi
fi

storage_path="$(terra_storage_path)"
required_bytes="$(du -sb -- "$backup_dir" 2>/dev/null | awk '{print $1}')"
space_dir="$storage_path"
while [[ ! -d "$space_dir" ]]; do space_dir="$(dirname "$space_dir")"; done
available_bytes="$(df --output=avail -B1 "$space_dir" 2>/dev/null | tail -1 | tr -d ' ')"
if [[ "$required_bytes" =~ ^[0-9]+$ && "$available_bytes" =~ ^[0-9]+$ ]] && ((required_bytes > available_bytes)); then
  terra_error "Espacio insuficiente: la copia de seguridad requiere $required_bytes bytes y hay $available_bytes disponibles."
  exit 1
fi

printf '\nRestauración local:\n  Backup: %s\n  Componentes: %s\n  Almacenamiento: %s\n\n' "$backup_dir" "$mode" "$storage_path"
terra_confirm "Esta operación sustituirá los datos indicados. ¿Continuar?" || {
  terra_error "Restauración cancelada."
  exit 3
}

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/terra-restore.XXXXXX")"
chmod 700 "$tmpdir"
cleanup() { rm -rf -- "$tmpdir"; }
trap cleanup EXIT

if [[ "$dump" == *.gpg ]]; then
  command -v gpg >/dev/null 2>&1 || terra_die "Backup cifrado y gpg no disponible." 1
  gpg --batch --yes --decrypt --output "$tmpdir/terra.dump" "$dump"
  dump="$tmpdir/terra.dump"
fi
if ((restore_storage == 1)) && [[ "$archive" == *.gpg ]]; then
  command -v gpg >/dev/null 2>&1 || terra_die "Backup cifrado y gpg no disponible." 1
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
    terra_error "Falló la restauración de PostgreSQL. La copia de seguridad se conserva."
    exit 1
  fi
  terra_ok "PostgreSQL restaurado."
fi

if ((restore_storage == 1)); then
  terra_step "Restaurando almacenamiento local"
  mkdir -p -- "$storage_path"
  if ! tar xzf "$archive" -C "$storage_path"; then
    terra_error "Falló la restauración del almacenamiento. La copia de seguridad se conserva."
    exit 1
  fi
  terra_ok "Almacenamiento restaurado."
fi

terra_step "Reiniciando servicios"
terra_compose up -d db >/dev/null
terra_wait_healthy db 240
terra_compose up -d api worker web >/dev/null
for service in api worker web; do terra_wait_healthy "$service" 240; done
if ! terra_verify_stack; then
  terra_error "La restauración terminó, pero la verificación falló. No elimine la copia de seguridad."
  exit 1
fi

if ((restore_db == 1 && restore_storage == 1)); then
  terra_step "Comprobando consistencia"
  missing=0
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    [[ -f "$storage_path/$rel" ]] || { terra_error "Falta: $rel"; missing=$((missing + 1)); }
  done < <(terra_db_psql "SELECT relative_path FROM stored_files WHERE status='completed' ORDER BY relative_path;" 2>/dev/null || true)
  if ((missing > 0)); then
    terra_error "Faltan $missing archivo(s) de la copia de seguridad."
    exit 1
  fi
  terra_ok "Consistencia verificada."
fi

terra_ok "Restauración local completada. Backup conservado en $backup_dir."
terra_warn "Si TOKEN_ENCRYPTION_KEY no coincide, los trabajadores deberán reconectar Google Drive."
