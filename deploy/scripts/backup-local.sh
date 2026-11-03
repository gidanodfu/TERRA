#!/usr/bin/env bash
# =============================================================================
# TERRA - backup-local.sh
# Versión: 2.0.0
# Descripción: respaldo local coordinado de PostgreSQL y del volumen documental.
# Uso: ./deploy/scripts/backup-local.sh [--no-verify]
# Requisitos: PostgreSQL activo y almacenamiento local accesible.
# Efectos: crea backups/<timestamp>/; nunca sobrescribe backups ni modifica datos.
#          No incluye .env ni TOKEN_ENCRYPTION_KEY.
# Códigos: 0 correcto · 1 fallo · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: backup-local.sh [--no-verify]

Genera:
  terra.dump / terra.dump.gpg
  storage.tar.gz / storage.tar.gz.gpg
  metadata.json
  SHA256SUMS

Variable opcional: BACKUP_GPG_RECIPIENT.
La clave TOKEN_ENCRYPTION_KEY NO se incluye; respáldela por separado.
USAGE
}

verify=1
while (($# > 0)); do
  case "$1" in
    --no-verify) verify=0 ;;
    -h|--help) usage; exit 0 ;;
    *) terra_error "Opción desconocida: $1"; usage; exit 2 ;;
  esac
  shift
done

terra_check_env_file
terra_check_commands
terra_require_db_running
storage_path="$(terra_storage_path)"
[[ -d "$storage_path" ]] || terra_die "No existe el almacenamiento local: $storage_path" 1

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="$TERRA_ROOT_DIR/backups"
backup_dir="$backup_root/$stamp"
[[ ! -e "$backup_dir" ]] || terra_die "El backup $backup_dir ya existe; no se sobrescribe." 1
mkdir -p "$backup_root"
chmod 700 "$backup_root"
mkdir -m 700 "$backup_dir"

user="$(terra_env_get POSTGRES_USER)"
db="$(terra_env_get POSTGRES_DB)"
dump="$backup_dir/terra.dump"
archive="$backup_dir/storage.tar.gz"

terra_step "Respaldando PostgreSQL ($db)"
if ! terra_compose exec -T db pg_dump -U "$user" -d "$db" -Fc > "$dump"; then
  terra_error "pg_dump falló. Backup parcial en $backup_dir."
  exit 1
fi
[[ -s "$dump" ]] || terra_die "El dump quedó vacío." 1

terra_step "Respaldando almacenamiento local"
if ! tar czf "$archive" -C "$storage_path" .; then
  terra_error "El archivo del almacenamiento falló. Backup parcial en $backup_dir."
  exit 1
fi
[[ -s "$archive" ]] || terra_die "El archivo de almacenamiento quedó vacío." 1

encrypted=false
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  command -v gpg >/dev/null 2>&1 || terra_die "BACKUP_GPG_RECIPIENT definido pero gpg no está instalado." 1
  terra_step "Cifrando backup con GPG"
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$dump"
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" "$archive"
  rm -f "$dump" "$archive"
  encrypted=true
fi

cat > "$backup_dir/metadata.json" <<META
{
  "application": "TERRA",
  "distribution": "local-development",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_commit": "$(terra_repo_commit)",
  "database": "$db",
  "storage_host_path": "$storage_path",
  "postgres_image": "postgres:18-alpine",
  "encrypted": $encrypted,
  "token_key_included": false
}
META

(cd "$backup_dir" && sha256sum ./* > SHA256SUMS)

if [[ "$verify" == "1" ]]; then
  terra_step "Verificando backup"
  (cd "$backup_dir" && sha256sum -c SHA256SUMS >/dev/null) || terra_die "Checksums inválidos." 1
  local_dump="$dump"
  local_archive="$archive"
  [[ -f "$backup_dir/terra.dump.gpg" ]] && local_dump="$backup_dir/terra.dump.gpg"
  [[ -f "$backup_dir/storage.tar.gz.gpg" ]] && local_archive="$backup_dir/storage.tar.gz.gpg"
  if [[ "$local_archive" != *.gpg ]]; then
    tar tzf "$local_archive" >/dev/null 2>&1 || terra_die "El archivo de almacenamiento no es válido." 1
  fi
  if [[ "$local_dump" == *.gpg ]]; then
    terra_warn "Dump cifrado: verificación pg_restore omitida hasta disponer de la clave."
  else
    terra_compose exec -T db pg_restore --list < "$local_dump" >/dev/null 2>&1 \
      || terra_die "pg_restore no reconoce el dump." 1
  fi
  terra_ok "Backup verificado."
fi

terra_ok "Backup local completado: $backup_dir ($(terra_file_size "$backup_dir"))"
terra_warn "TOKEN_ENCRYPTION_KEY no está incluida. Respáldela por separado."
