#!/usr/bin/env bash
# =============================================================================
# TERRA - status.sh
# Versión: 1.0.0
# Descripción: muestra estado de servicios, salud, imágenes, puertos, redes,
#              volúmenes, almacenamiento, PostgreSQL, API y worker.
# Uso: ./deploy/scripts/status.sh <dev|prod>
# Requisitos: Docker y configuración legibles.
# Efectos: solo lectura. No imprime secretos.
# Códigos: 0 consulta realizada · 1 error de infraestructura · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: status.sh <dev|prod>

Muestra el estado operativo completo. Es seguro ejecutarlo con TERRA detenido.
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
terra_compose config >/dev/null

printf '\n%s\n' "TERRA STATUS — $TERRA_ENV ($TERRA_ENV_SHORT)"
printf 'Proyecto Docker: %s\n' "$TERRA_PROJECT"
printf 'Archivo de configuración: %s\n\n' "$(basename "$TERRA_ENV_FILE")"

printf '%-8s %-14s %-14s %-24s\n' "SERVICIO" "ESTADO" "HEALTH" "IMAGEN"
printf '%s\n' "----------------------------------------------------------------------------"
for service in "${TERRA_ALLOWED_SERVICES[@]}"; do
  id="$(terra_service_container "$service" 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    printf '%-8s %-14s %-14s %-24s\n' "$service" "MISSING" "-" "-"
    continue
  fi
  state="$("$TERRA_DOCKER_BIN" inspect -f '{{.State.Status}}' "$id" 2>/dev/null || echo unknown)"
  health="$(terra_container_health "$service")"
  image_ref="$("$TERRA_DOCKER_BIN" inspect -f '{{.Config.Image}}' "$id" 2>/dev/null || echo unknown)"
  printf '%-8s %-14s %-14s %-24s\n' "$service" "$state" "$health" "$image_ref"
done

printf '\n%s\n' "Puertos publicados"
terra_compose ps --format 'table {{.Service}}\t{{.Ports}}' 2>/dev/null || true

printf '\n%s\n' "Redes del proyecto"
"$TERRA_DOCKER_BIN" network ls --filter "name=$TERRA_NETWORK" --format '  {{.Name}} ({{.Driver}})' 2>/dev/null || true

printf '\n%s\n' "Volúmenes del proyecto"
if terra_volume_exists; then
  "$TERRA_DOCKER_BIN" volume inspect "$TERRA_DB_VOLUME" --format '  {{.Name}} ({{.Driver}})' 2>/dev/null || true
else
  printf '  %s no existe\n' "$TERRA_DB_VOLUME"
fi

storage_path="$(terra_storage_path)"
printf '\n%s\n' "Almacenamiento documental"
printf '  Ruta host: %s\n' "$storage_path"
if [[ -d "$storage_path" ]]; then
  printf '  Tamaño: %s\n' "$(terra_file_size "$storage_path")"
  printf '  Espacio libre: %s\n' "$(df -h --output=avail "$storage_path" 2>/dev/null | tail -1 | tr -d ' ')"
else
  printf '  MISSING\n'
fi

printf '\n%s\n' "PostgreSQL"
if [[ "$(terra_container_health db)" == "healthy" || "$(terra_container_health db)" == "running" ]]; then
  user="$(terra_env_get POSTGRES_USER)"
  db="$(terra_env_get POSTGRES_DB)"
  if terra_compose exec -T db pg_isready -U "$user" -d "$db" >/dev/null 2>&1; then
    printf '  Conexión: OK\n'
  else
    printf '  Conexión: FAIL\n'
  fi
  migrations="$(terra_db_psql "SELECT count(*) FROM schema_migrations;" 2>/dev/null || echo '?')"
  users="$(terra_db_psql "SELECT count(*) FROM users;" 2>/dev/null || echo '?')"
  jobs="$(terra_db_psql "SELECT count(*) FROM download_jobs;" 2>/dev/null || echo '?')"
  printf '  Migraciones aplicadas: %s\n  Usuarios: %s\n  Trabajos: %s\n' "$migrations" "$users" "$jobs"
else
  printf '  Servicio no disponible\n'
fi

printf '\n%s\n' "API y worker"
port="$(terra_web_port)"
if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/v1/health" >/dev/null 2>&1; then
  printf '  API /health: OK (a través de web)\n'
else
  printf '  API /health: FAIL\n'
fi
if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/v1/ready" >/dev/null 2>&1; then
  printf '  API /ready: OK (PostgreSQL)\n'
else
  printf '  API /ready: FAIL\n'
fi
heartbeat="$(terra_db_psql "SELECT COALESCE(to_char(max(heartbeat_at), 'YYYY-MM-DD HH24:MI:SS'), 'sin trabajos recientes') FROM download_jobs;" 2>/dev/null || echo '?')"
printf '  Último heartbeat registrado: %s\n' "$heartbeat"
printf '\n'
