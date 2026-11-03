#!/usr/bin/env bash
# =============================================================================
# TERRA - status.sh
# Versión: 2.0.0
# Descripción: muestra estado de servicios, salud, imágenes, puertos, red,
#              volúmenes, almacenamiento, PostgreSQL, API y worker.
# Uso: ./deploy/scripts/status.sh
# Efectos: solo lectura.
# Códigos: 0 consulta realizada · 1 error de infraestructura · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

case "${1:-}" in
  -h|--help) printf 'Uso: status.sh\nMuestra el estado del entorno local.\n'; exit 0 ;;
  "") ;;
  *) terra_error "Argumentos no permitidos."; exit 2 ;;
esac

terra_check_env_file
terra_check_commands
terra_compose config >/dev/null

printf '\n%s\n' "TERRA STATUS — desarrollo local"
printf 'Proyecto Docker: %s\n' "$TERRA_PROJECT"
printf 'Archivo de configuración: .env\n\n'

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

printf '\n%s\n' "Red del proyecto"
"$TERRA_DOCKER_BIN" network ls --filter "label=com.docker.compose.project=$TERRA_PROJECT" --format '  {{.Name}} ({{.Driver}})' 2>/dev/null || true

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

printf '\n%s\n' "API, worker y Vite"
port="$(terra_web_port)"
if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/v1/health" >/dev/null 2>&1; then
  printf '  API /health vía Vite proxy: OK\n'
else
  printf '  API /health vía Vite proxy: FAIL\n'
fi
if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/v1/ready" >/dev/null 2>&1; then
  printf '  API /ready: OK\n'
else
  printf '  API /ready: FAIL\n'
fi
if curl -fsS --max-time 5 "http://127.0.0.1:$port/" >/dev/null 2>&1; then
  printf '  Vite dev server: OK (http://127.0.0.1:%s)\n' "$port"
else
  printf '  Vite dev server: FAIL\n'
fi
heartbeat="$(terra_db_psql "SELECT COALESCE(to_char(max(heartbeat_at), 'YYYY-MM-DD HH24:MI:SS'), 'sin trabajos recientes') FROM download_jobs;" 2>/dev/null || echo '?')"
printf '  Último heartbeat registrado: %s\n\n' "$heartbeat"
