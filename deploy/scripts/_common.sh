#!/usr/bin/env bash
# =============================================================================
# TERRA - funciones compartidas de desarrollo local
# Versión: 2.0.0
# Descripción: rutas, Compose, validaciones, healthchecks y confirmaciones.
# Uso: sourced por los scripts de deploy/scripts. No se ejecuta directamente.
# Requisitos: Docker Engine, Docker Compose v2, curl.
# Efectos: no modifica contenedores ni volúmenes por sí mismo.
# =============================================================================
# shellcheck shell=bash

TERRA_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
TERRA_DEPLOY_DIR="$(cd -- "$TERRA_SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
TERRA_ROOT_DIR="$(cd -- "$TERRA_DEPLOY_DIR/.." >/dev/null 2>&1 && pwd)"
TERRA_DOCKER_BIN="${TERRA_DOCKER_BIN:-docker}"
TERRA_PROJECT="terra"
TERRA_ENV_FILE="$TERRA_ROOT_DIR/.env"
TERRA_COMPOSE_FILE="$TERRA_DEPLOY_DIR/compose.yaml"
TERRA_DB_VOLUME="${TERRA_PROJECT}_terra-db"
TERRA_BACKEND_IMAGE="terra-backend:local"
TERRA_WEB_IMAGE="terra-web:local"
TERRA_ALLOWED_SERVICES=(web api worker db)
TERRA_MIN_DOCKER_VERSION="24.0.0"
TERRA_MIN_COMPOSE_VERSION="2.20.0"
TERRA_UID="$(id -u)"
TERRA_GID="$(id -g)"
export TERRA_UID TERRA_GID

if [[ -t 1 ]]; then
  TERRA_C_RESET=$'\033[0m'; TERRA_C_BLUE=$'\033[1;34m'; TERRA_C_GREEN=$'\033[1;32m'
  TERRA_C_YELLOW=$'\033[1;33m'; TERRA_C_RED=$'\033[1;31m'; TERRA_C_DIM=$'\033[2m'
else
  TERRA_C_RESET=""; TERRA_C_BLUE=""; TERRA_C_GREEN=""; TERRA_C_YELLOW=""; TERRA_C_RED=""; TERRA_C_DIM=""
fi

terra_info()  { printf '%s[TERRA]%s %s\n' "$TERRA_C_BLUE" "$TERRA_C_RESET" "$*"; }
terra_step()  { printf '\n%s[TERRA]%s %s\n' "$TERRA_C_BLUE" "$TERRA_C_RESET" "$*"; }
terra_ok()    { printf '%s[TERRA]%s %s\n' "$TERRA_C_GREEN" "$TERRA_C_RESET" "$*"; }
terra_warn()  { printf '%s[TERRA]%s %s\n' "$TERRA_C_YELLOW" "$TERRA_C_RESET" "$*" >&2; }
terra_error() { printf '%s[TERRA]%s %s\n' "$TERRA_C_RED" "$TERRA_C_RESET" "$*" >&2; }
terra_dim()   { printf '%s%s%s\n' "$TERRA_C_DIM" "$*" "$TERRA_C_RESET"; }

terra_die() {
  local code="${2:-1}"
  terra_error "$1"
  exit "$code"
}

terra_on_error() {
  local status=$?
  terra_error "La operación falló en la línea $1 (código $status)."
  terra_error "Ejecute ./terra doctor o ./terra logs para diagnosticar."
  exit "$status"
}

terra_enable_traps() {
  trap 'terra_on_error $LINENO' ERR
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

terra_compose() {
  "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
    -f "$TERRA_COMPOSE_FILE" "$@"
}

terra_env_get() {
  local key="$1" file="${2:-$TERRA_ENV_FILE}"
  [[ -f "$file" ]] || return 0
  awk -v key="$key" '
    /^[[:space:]]*#/ { next }
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      gsub(/\r$/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if ((value ~ /^".*"$/) || (value ~ /^\047.*\047$/)) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
      exit
    }
  ' "$file"
}

terra_version_ge() {
  local have="$1" minimum="$2"
  [[ "$(printf '%s\n%s\n' "$minimum" "$have" | sort -V | head -n1)" == "$minimum" ]]
}

terra_check_env_file() {
  if [[ ! -f "$TERRA_ENV_FILE" ]]; then
    terra_error "No existe .env en la raíz del repositorio."
    terra_error "Ejecute: cp .env.example .env && chmod 600 .env"
    return 1
  fi
  local mode
  mode="$(stat -c '%a' "$TERRA_ENV_FILE" 2>/dev/null || echo '')"
  if [[ -n "$mode" && "$mode" != "600" && "$mode" != "400" ]]; then
    terra_warn "El archivo .env tiene permisos $mode. Se recomienda 600."
  fi
}

terra_check_commands() {
  local missing=() cmd
  for cmd in curl tar gzip sha256sum awk sed sort find stat base64 realpath; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if ((${#missing[@]} > 0)); then
    terra_error "Faltan comandos requeridos en el host: ${missing[*]}"
    return 1
  fi
  if ! command -v "$TERRA_DOCKER_BIN" >/dev/null 2>&1; then
    terra_error "Docker no está disponible ('$TERRA_DOCKER_BIN' no existe en PATH)."
    return 1
  fi
  if ! "$TERRA_DOCKER_BIN" info >/dev/null 2>&1; then
    terra_error "El daemon de Docker no está accesible. Inicie Docker o verifique sus permisos."
    return 1
  fi
  if ! "$TERRA_DOCKER_BIN" compose version >/dev/null 2>&1; then
    terra_error "Docker Compose v2 no está disponible como plugin ('docker compose')."
    return 1
  fi
  local docker_version compose_version
  docker_version="$("$TERRA_DOCKER_BIN" version --format '{{.Server.Version}}' 2>/dev/null | sed 's/-.*$//')"
  compose_version="$("$TERRA_DOCKER_BIN" compose version --short 2>/dev/null | sed 's/^v//;s/-.*$//')"
  if [[ -n "$docker_version" ]] && ! terra_version_ge "$docker_version" "$TERRA_MIN_DOCKER_VERSION"; then
    terra_warn "Docker $docker_version es anterior al mínimo documentado $TERRA_MIN_DOCKER_VERSION."
  fi
  if [[ -n "$compose_version" ]] && ! terra_version_ge "$compose_version" "$TERRA_MIN_COMPOSE_VERSION"; then
    terra_error "Docker Compose $compose_version es anterior al mínimo requerido $TERRA_MIN_COMPOSE_VERSION."
    return 1
  fi
  return 0
}

terra_require_var() {
  local key="$1" critical="${2:-0}" value
  value="$(terra_env_get "$key")"
  if [[ -z "$value" ]]; then
    terra_error "Falta la variable obligatoria $key en .env."
    return 1
  fi
  if [[ "$critical" == "1" ]] && terra_is_placeholder "$value"; then
    terra_error "La variable $key conserva un valor de ejemplo o inseguro."
    terra_error "Genere un valor local real antes de continuar (no se imprime el valor actual)."
    return 1
  fi
  return 0
}

terra_is_placeholder() {
  local value="${1:-}"
  [[ "$value" =~ (change[-_]?me|changeme|replace[-_]?me|placeholder|your[-_]|example\.com|dummy|todo|xxxx) ]] && return 0
  case "$value" in
    ""|"postgres"|"password"|"secret") return 0 ;;
  esac
  return 1
}

terra_validate_aes_key() {
  local value decoded_len
  value="$(terra_env_get TOKEN_ENCRYPTION_KEY)"
  if [[ -z "$value" ]]; then
    terra_error "TOKEN_ENCRYPTION_KEY está vacía."
    return 1
  fi
  if ! decoded_len="$(printf '%s' "$value" | base64 -d 2>/dev/null | wc -c | tr -d ' ')"; then
    terra_error "TOKEN_ENCRYPTION_KEY no es base64 válido."
    return 1
  fi
  if [[ "$decoded_len" != "32" ]]; then
    terra_error "TOKEN_ENCRYPTION_KEY debe decodificar exactamente 32 bytes (openssl rand -base64 32)."
    return 1
  fi
  return 0
}

terra_validate_database_url() {
  local url host
  url="$(terra_env_get DATABASE_URL)"
  if [[ ! "$url" =~ ^postgres(ql)?:// ]]; then
    terra_error "DATABASE_URL debe comenzar con postgres:// o postgresql://."
    return 1
  fi
  host="$(printf '%s' "$url" | sed -E 's#^postgres(ql)?://([^@/]*@)?([^:/?]+).*#\3#')"
  if [[ "$host" != "db" ]]; then
    terra_error "DATABASE_URL debe apuntar al servicio Docker 'db'."
    return 1
  fi
  return 0
}

terra_validate_storage_root() {
  local value
  value="$(terra_env_get STORAGE_ROOT)"
  if [[ -z "$value" || "$value" != /* || "$value" == "/" || "$value" == *".."* ]]; then
    terra_error "STORAGE_ROOT debe ser una ruta absoluta segura (por ejemplo /var/lib/terra)."
    return 1
  fi
  if [[ "$value" != "/var/lib/terra" ]]; then
    terra_error "STORAGE_ROOT debe ser /var/lib/terra para coincidir con el montaje de Compose."
    return 1
  fi
  return 0
}

terra_storage_path() {
  local raw
  raw="$(terra_env_get STORAGE_HOST_PATH)"
  raw="${raw:-../data/dev}"
  if [[ "$raw" != /* ]]; then
    raw="$TERRA_DEPLOY_DIR/$raw"
  fi
  TERRA_STORAGE_PATH="$(realpath -m -- "$raw")"
  printf '%s' "$TERRA_STORAGE_PATH"
}

terra_ensure_caches() {
  mkdir -p -- "$TERRA_ROOT_DIR/.cache/go-mod" "$TERRA_ROOT_DIR/.cache/go-build"
  chmod 750 "$TERRA_ROOT_DIR/.cache" "$TERRA_ROOT_DIR/.cache/go-mod" "$TERRA_ROOT_DIR/.cache/go-build" 2>/dev/null || true
  [[ -w "$TERRA_ROOT_DIR/.cache/go-mod" && -w "$TERRA_ROOT_DIR/.cache/go-build" ]] || {
    terra_error "Los cachés locales .cache/ no son escribibles."
    return 1
  }
}

terra_ensure_storage() {
  local path
  path="$(terra_storage_path)"
  mkdir -p -- "$path/staging" "$path/areas"
  chmod 750 -- "$path" "$path/staging" "$path/areas" 2>/dev/null || true
  if [[ ! -w "$path" ]]; then
    terra_error "El almacenamiento local no es escribible: $path"
    return 1
  fi
  TERRA_STORAGE_PATH="$path"
  export TERRA_STORAGE_PATH
  terra_ok "Almacenamiento local disponible: $path"
}

terra_validate_files() {
  local required=(
    "$TERRA_ROOT_DIR/.env.example"
    "$TERRA_ROOT_DIR/backend/Dockerfile"
    "$TERRA_ROOT_DIR/frontend/Dockerfile"
    "$TERRA_COMPOSE_FILE"
  )
  local f missing=()
  for f in "${required[@]}"; do
    [[ -e "$f" ]] || missing+=("$f")
  done
  if ((${#missing[@]} > 0)); then
    terra_error "Faltan archivos requeridos del proyecto:"
    printf '  - %s\n' "${missing[@]}" >&2
    return 1
  fi
  return 0
}

terra_validate_compose() {
  if ! terra_compose config >/dev/null 2>&1; then
    terra_error "La configuración de Docker Compose no es válida."
    terra_error "Ejecute: docker compose --env-file .env -f deploy/compose.yaml config"
    return 1
  fi
  local actual
  actual="$(terra_compose config --services 2>/dev/null | sort | tr '\n' ' ')"
  if [[ "$actual" != "api db web worker " ]]; then
    terra_error "Los servicios Compose deben ser exactamente web, api, worker y db."
    terra_error "Servicios detectados: ${actual:-<ninguno>}"
    return 1
  fi
  return 0
}

terra_check_required_vars() {
  local for_init="${1:-0}" failed=0 key critical
  local required=(
    APP_ENV APP_PUBLIC_URL DATABASE_URL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
    SESSION_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URL
    GOOGLE_DRIVE_REDIRECT_URL TOKEN_ENCRYPTION_KEY TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY
    STORAGE_ROOT STORAGE_HOST_PATH DOWNLOAD_MIN_INTERVAL_MS WORKER_CONCURRENCY
    WORKER_PER_ACCOUNT_CONCURRENCY MAX_DOWNLOAD_BYTES MIN_FREE_DISK_BYTES
  )
  for key in "${required[@]}"; do
    critical=0
    case "$key" in
      POSTGRES_PASSWORD|SESSION_SECRET|GOOGLE_CLIENT_SECRET|TOKEN_ENCRYPTION_KEY|TURNSTILE_SECRET_KEY) critical=1 ;;
    esac
    terra_require_var "$key" "$critical" || failed=1
  done
  if [[ "$for_init" == "1" ]]; then
    terra_require_var BOOTSTRAP_ADMIN_USERNAME 0 || failed=1
    terra_require_var BOOTSTRAP_ADMIN_PASSWORD 1 || failed=1
  fi

  local session_secret app_env scopes public_url
  session_secret="$(terra_env_get SESSION_SECRET)"
  app_env="$(terra_env_get APP_ENV)"
  public_url="$(terra_env_get APP_PUBLIC_URL)"
  scopes="$(terra_env_get GOOGLE_DRIVE_SCOPES)"
  if ((${#session_secret} < 32)); then
    terra_error "SESSION_SECRET debe tener al menos 32 caracteres."
    failed=1
  fi
  if [[ "$app_env" != "development" ]]; then
    terra_error "APP_ENV debe ser 'development' en la distribución local."
    failed=1
  fi
  if [[ "$public_url" != http://localhost* && "$public_url" != http://127.0.0.1* ]]; then
    terra_error "APP_PUBLIC_URL debe ser local (http://localhost:... o http://127.0.0.1:...)."
    failed=1
  fi
  if [[ "$scopes" != *"https://www.googleapis.com/auth/drive.readonly"* ]]; then
    terra_error "GOOGLE_DRIVE_SCOPES debe incluir https://www.googleapis.com/auth/drive.readonly."
    failed=1
  fi
  terra_validate_aes_key || failed=1
  terra_validate_database_url || failed=1
  terra_validate_storage_root || failed=1
  return "$failed"
}

terra_volume_exists() {
  "$TERRA_DOCKER_BIN" volume inspect "$TERRA_DB_VOLUME" >/dev/null 2>&1
}

terra_storage_has_data() {
  local path
  path="$(terra_storage_path)"
  [[ -d "$path" ]] || return 1
  [[ -n "$(find "$path/areas" -mindepth 1 -print -quit 2>/dev/null || true)" ]] && return 0
  [[ -n "$(find "$path/staging" -mindepth 1 -print -quit 2>/dev/null || true)" ]] && return 0
  return 1
}

terra_backups() {
  local dir="$TERRA_ROOT_DIR/backups" entry
  [[ -d "$dir" ]] || return 0
  for entry in "$dir"/*; do
    [[ -d "$entry" && -f "$entry/metadata.json" ]] || continue
    grep -q '"distribution": "local-development"' "$entry/metadata.json" 2>/dev/null || continue
    basename "$entry"
  done | sort
}

terra_service_container() {
  terra_compose ps -q "$1" 2>/dev/null
}

terra_container_health() {
  local id
  id="$(terra_service_container "$1")"
  [[ -n "$id" ]] || { printf 'missing'; return 0; }
  "$TERRA_DOCKER_BIN" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || printf 'missing'
}

terra_wait_healthy() {
  local service="$1" timeout="${2:-180}" start="$SECONDS" status
  terra_info "Esperando healthcheck de $service…"
  while (( SECONDS - start < timeout )); do
    status="$(terra_container_health "$service")"
    case "$status" in
      healthy|running) terra_ok "$service: $status"; return 0 ;;
      unhealthy|exited|dead)
        terra_error "$service entró en estado $status."
        terra_error "Consulte: ./terra logs $service"
        return 1
        ;;
    esac
    sleep 2
  done
  terra_error "Timeout esperando $service ($timeout s). Estado: $(terra_container_health "$service")"
  return 1
}

terra_wait_http() {
  local url="$1" timeout="${2:-60}" start="$SECONDS"
  while (( SECONDS - start < timeout )); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

terra_web_port() {
  local port
  port="$(terra_env_get WEB_PORT)"
  printf '%s' "${port:-8080}"
}

terra_db_psql() {
  local sql="$1" user db
  user="$(terra_env_get POSTGRES_USER)"
  db="$(terra_env_get POSTGRES_DB)"
  terra_compose exec -T db psql -U "$user" -d "$db" -Atc "$sql"
}

terra_require_db_running() {
  local status
  status="$(terra_container_health db)"
  if [[ "$status" != "healthy" && "$status" != "running" ]]; then
    terra_error "PostgreSQL no está disponible (estado: $status)."
    terra_error "Ejecute ./terra up o ./terra init."
    return 1
  fi
  return 0
}

terra_require_api_running() {
  local status
  status="$(terra_container_health api)"
  if [[ "$status" != "healthy" && "$status" != "running" ]]; then
    terra_error "La API no está disponible (estado: $status)."
    terra_error "Ejecute ./terra up."
    return 1
  fi
  return 0
}

terra_require_stack() {
  local service missing=()
  for service in "${TERRA_ALLOWED_SERVICES[@]}"; do
    [[ -n "$(terra_service_container "$service")" ]] || missing+=("$service")
  done
  if ((${#missing[@]} > 0)); then
    terra_error "Faltan contenedores de TERRA: ${missing[*]}"
    terra_error "Ejecute ./terra init o ./terra up."
    return 1
  fi
  return 0
}

terra_check_web_port_mapping() {
  local id mapping host_port
  id="$(terra_service_container web)"
  if [[ -z "$id" ]]; then
    terra_error "No existe el contenedor web."
    return 1
  fi
  host_port="$(terra_web_port)"
  mapping="$("$TERRA_DOCKER_BIN" port "$id" 5173/tcp 2>/dev/null || true)"
  if [[ "$mapping" == *":$host_port"* ]]; then
    terra_ok "Puerto web publicado: $host_port → 5173/tcp"
    return 0
  fi
  terra_error "El puerto publicado no corresponde a Vite (esperado host $host_port → 5173/tcp)."
  terra_error "Mapeo actual: ${mapping:-<ninguno>}"
  return 1
}

terra_check_web_dependencies() {
  if terra_compose exec -T web test -f node_modules/vite/dist/client/client.mjs >/dev/null 2>&1; then
    terra_ok "Dependencias del frontend visibles dentro de web (node_modules/vite)"
    return 0
  fi
  terra_error "node_modules/vite no está visible dentro del contenedor web."
  terra_error "Esto rompe /@vite/client y React Refresh; reconstruya web con ./terra build web y ./terra up."
  return 1
}

terra_check_vite_assets() {
  local base="$1" tmp headers body client failed=0
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/terra-vite-check.XXXXXX")"
  headers="$tmp/headers"
  body="$tmp/body"

  if ! curl -fsS --max-time 5 -D "$headers" -o "$body" "$base/@vite/client" 2>/dev/null; then
    terra_error "No se pudo solicitar /@vite/client."
    rm -rf -- "$tmp"
    return 1
  fi
  client="$(cat "$body")"
  if grep -qi '^content-type: .*javascript' "$headers" && [[ "$client" == *"/node_modules/vite/dist/client"* ]]; then
    terra_ok "/@vite/client se sirve como JavaScript de Vite"
  else
    terra_error "/@vite/client no es el cliente JavaScript de Vite."
    terra_error "Recibido: $(head -c 120 "$body" | tr '\n' ' ')"
    failed=1
  fi

  if curl -fsS --max-time 5 -D "$headers" -o "$body" "$base/@react-refresh" 2>/dev/null \
      && grep -qi '^content-type: .*javascript' "$headers" \
      && grep -q 'injectIntoGlobalHook' "$body"; then
    terra_ok "/@react-refresh disponible para React Refresh"
  else
    terra_error "/@react-refresh no está disponible; React Refresh no funcionará."
    failed=1
  fi

  if curl -fsS --max-time 5 -D "$headers" -o "$body" "$base/src/main.jsx" 2>/dev/null \
      && grep -qi '^content-type: .*javascript' "$headers"; then
    terra_ok "/src/main.jsx se sirve como módulo JavaScript"
  else
    terra_error "/src/main.jsx no se sirve como módulo JavaScript."
    failed=1
  fi

  if curl -fsS --max-time 5 -D "$headers" -o "$body" "$base/src/styles/index.css" 2>/dev/null \
      && grep -qi '^content-type: .*javascript' "$headers"; then
    terra_ok "CSS de desarrollo se sirve como módulo Vite"
  else
    terra_error "El CSS de desarrollo no se sirve correctamente."
    failed=1
  fi

  if curl -fsS --max-time 5 "$base/" 2>/dev/null | grep -q '@vite/client' \
      && curl -fsS --max-time 5 "$base/" 2>/dev/null | grep -q 'id="root"'; then
    terra_ok "HTML de desarrollo contiene Vite client y #root"
  else
    terra_error "El HTML servido no corresponde al index de desarrollo de Vite."
    failed=1
  fi

  rm -rf -- "$tmp"
  return "$failed"
}

terra_verify_stack() {
  local failed=0 service status port base storage_root migrations storage_path
  terra_step "Verificando los cuatro servicios"
  for service in "${TERRA_ALLOWED_SERVICES[@]}"; do
    status="$(terra_container_health "$service")"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      terra_ok "$service: $status"
    else
      terra_error "$service: $status"
      failed=1
    fi
  done

  port="$(terra_web_port)"
  base="http://127.0.0.1:$port"

  terra_step "Verificando Vite, proxy y API"
  if terra_wait_http "$base/" 30; then
    terra_ok "Vite responde en el puerto $port"
  else
    terra_error "Vite no responde."
    failed=1
  fi
  if terra_wait_http "$base/api/v1/health" 30; then
    terra_ok "Proxy de Vite → API /health"
  else
    terra_error "El proxy de Vite no alcanza la API."
    failed=1
  fi
  if terra_wait_http "$base/api/v1/ready" 30; then
    terra_ok "API reporta PostgreSQL listo (/ready)"
  else
    terra_error "API no reporta readiness."
    failed=1
  fi

  terra_step "Verificando recursos Vite / React"
  terra_check_web_port_mapping || failed=1
  terra_check_web_dependencies || failed=1
  terra_check_vite_assets "$base" || failed=1

  storage_root="$(terra_env_get STORAGE_ROOT)"
  storage_root="${storage_root:-/var/lib/terra}"
  if terra_compose exec -T api test -r "$storage_root" >/dev/null 2>&1; then
    terra_ok "API puede leer el almacenamiento"
  else
    terra_error "API no puede leer $storage_root."
    failed=1
  fi
  if terra_compose exec -T worker test -w "$storage_root/staging" >/dev/null 2>&1; then
    terra_ok "Worker puede escribir el almacenamiento"
  else
    terra_error "Worker no puede escribir $storage_root/staging."
    failed=1
  fi

  if migrations="$(terra_db_psql "SELECT count(*) FROM schema_migrations;" 2>/dev/null)"; then
    if [[ "$migrations" =~ ^[0-9]+$ ]] && ((migrations > 0)); then
      terra_ok "Migraciones aplicadas: $migrations"
    else
      terra_error "No se detectaron migraciones aplicadas."
      failed=1
    fi
  else
    terra_error "No fue posible consultar schema_migrations."
    failed=1
  fi

  storage_path="$(terra_storage_path)"
  if [[ -d "$storage_path" ]]; then
    terra_ok "Volumen documental local: $storage_path"
  else
    terra_error "No existe el volumen documental: $storage_path"
    failed=1
  fi

  if ((failed != 0)); then
    terra_error "La verificación encontró fallos. Use ./terra doctor."
    return 1
  fi
  return 0
}

terra_print_summary() {
  local title="${1:-TERRA READY}" bootstrap="${2:-0}" port
  port="$(terra_web_port)"
  printf '\n%s\n' "$title"
  printf 'Distribution: local development\n'
  printf 'Docker: OK\nCompose: OK\nDatabase: HEALTHY\nAPI: HEALTHY\nWorker: HEALTHY\nWeb (Vite): HEALTHY\n'
  printf 'Storage: READY\nMigrations: APPLIED\n'
  if [[ "$bootstrap" == "1" ]]; then printf 'Bootstrap: VERIFIED\n'; fi
  printf '\nServices:\n- web\n- api\n- worker\n- db\n'
  printf '\nURL local: http://127.0.0.1:%s\n' "$port"
}

terra_confirm() {
  local prompt="$1" expected="${2:-}" answer
  if [[ -n "$expected" ]]; then
    if [[ "${CONFIRM_LOCAL:-}" == "$expected" ]]; then
      return 0
    fi
    if [[ ! -t 0 ]]; then
      terra_error "Se requiere confirmación adicional: CONFIRM_LOCAL='$expected'."
      return 1
    fi
    read -r -p "$prompt Escriba exactamente '$expected': " answer
    [[ "$answer" == "$expected" ]]
    return
  fi
  if [[ "${CONFIRM:-}" == "yes" ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    terra_error "Operación destructiva sin terminal interactiva. Use CONFIRM=yes."
    return 1
  fi
  read -r -p "$prompt [s/N]: " answer
  [[ "$answer" =~ ^[sSyY]$ ]]
}

terra_file_size() {
  du -sh -- "$1" 2>/dev/null | awk '{print $1}'
}

terra_repo_commit() {
  git -C "$TERRA_ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown'
}

terra_assert_service() {
  local service="$1" allowed
  for allowed in "${TERRA_ALLOWED_SERVICES[@]}"; do
    [[ "$service" == "$allowed" ]] && return 0
  done
  terra_error "Servicio inválido: $service. Permitidos: ${TERRA_ALLOWED_SERVICES[*]}"
  return 2
}

terra_image_name() {
  case "$1" in
    web) printf '%s' "$TERRA_WEB_IMAGE" ;;
    api|worker) printf '%s' "$TERRA_BACKEND_IMAGE" ;;
    *) terra_error "Servicio sin imagen construible: $1"; return 2 ;;
  esac
}

terra_image_exists() {
  "$TERRA_DOCKER_BIN" image inspect "$(terra_image_name "$1")" >/dev/null 2>&1
}

terra_missing_images() {
  local service missing=()
  for service in web api; do
    terra_image_exists "$service" || missing+=("$service")
  done
  printf '%s' "${missing[*]:-}"
}
