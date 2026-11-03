#!/usr/bin/env bash
# =============================================================================
# TERRA - test.sh
# Versión: 1.0.0
# Descripción: ejecuta pruebas unitarias, de integración y E2E HTTP.
# Uso: ./deploy/scripts/test.sh <dev|prod> <unit|integration|e2e|all>
# Requisitos: Docker; para integración/E2E, TERRA activo.
# Efectos: pruebas unitarias usan contenedores efímeros de toolchain (no son
#          servicios Compose). Integración/E2E son de solo lectura.
#          Registra resultados en artifacts/tests/.
# Códigos: 0 todo correcto · 1 alguna prueba falló · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'EOF'
Uso: test.sh <dev|prod> <unit|integration|e2e|all>

  unit         go test ./... + go vet ./... + build del frontend
  integration  salud de los 4 servicios, PostgreSQL, migraciones e invariantes
  e2e          smoke HTTP: frontend, API, seguridad, autenticación y 404 JSON
  all          ejecuta las tres categorías

Las pruebas unitarias usan imágenes golang:1.27-alpine y node:24-alpine como
contenedores efímeros. No se agregan servicios a Docker Compose.
EOF
}

if (($# < 2)); then usage; exit 2; fi
terra_parse_environment "$1"
mode="$2"
shift 2
[[ $# -eq 0 ]] || { terra_error "Argumentos extra no permitidos."; exit 2; }
case "$mode" in unit|integration|e2e|all) ;; *) terra_error "Modo inválido: $mode"; usage; exit 2 ;; esac

terra_check_env_file
terra_check_commands
mkdir -p "$TERRA_ROOT_DIR/artifacts/tests"
log="$TERRA_ROOT_DIR/artifacts/tests/$(date -u +%Y%m%dT%H%M%SZ)-${TERRA_ENV_SHORT}-${mode}.log"

failures=0
run_logged() {
  "$@" 2>&1 | tee -a "$log"
  return "${PIPESTATUS[0]}"
}

log_section() {
  printf '\n===== %s =====\n' "$*" | tee -a "$log"
}

unit_tests() {
  log_section "UNIT — Go"
  if ! run_logged "$TERRA_DOCKER_BIN" run --rm \
      --user "$(id -u):$(id -g)" \
      -v "$TERRA_ROOT_DIR/backend:/src" -w /src \
      -e HOME=/tmp -e GOCACHE=/tmp/gocache -e GOPATH=/tmp/gopath \
      golang:1.27-alpine sh -c 'go test ./... && go vet ./...'; then
    terra_error "Pruebas unitarias Go fallaron."
    failures=$((failures + 1))
    return
  fi
  terra_ok "Pruebas unitarias Go correctas."

  log_section "UNIT — Frontend"
  local site_key tmp
  site_key="$(terra_env_get TURNSTILE_SITE_KEY)"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/terra-frontend-test.XXXXXX")"
  # Copia limpia: evita reutilizar node_modules nativos de otra libc/arquitectura.
  (cd "$TERRA_ROOT_DIR/frontend" && tar --exclude=node_modules --exclude=dist -cf - .) | (cd "$tmp" && tar xf -)
  chmod -R u+rwX "$tmp"
  if ! run_logged "$TERRA_DOCKER_BIN" run --rm \
      --user "$(id -u):$(id -g)" \
      -v "$tmp:/app" -w /app \
      -e HOME=/tmp -e "VITE_TURNSTILE_SITE_KEY=$site_key" \
      node:24-alpine sh -c 'npm ci --no-audit --no-fund && npm run build'; then
    rm -rf -- "$tmp"
    terra_error "La compilación del frontend falló."
    failures=$((failures + 1))
    return
  fi
  rm -rf -- "$tmp"
  terra_ok "Build del frontend correcto."
}

integration_tests() {
  log_section "INTEGRATION — stack y PostgreSQL"
  if ! terra_require_stack; then failures=$((failures + 1)); return; fi
  if ! terra_verify_stack 2>&1 | tee -a "$log"; then failures=$((failures + 1)); return; fi

  local invariant
  invariant="$(terra_db_psql "
    SELECT count(*) FROM users u
    JOIN positions p ON p.id = u.position_id
    WHERE u.area_id IS NOT NULL AND p.area_id <> u.area_id;" 2>/dev/null || echo '?')"
  if [[ "$invariant" != "0" ]]; then
    terra_error "Invariante organizativa violada: $invariant usuarios con cargo de otra área."
    failures=$((failures + 1))
  else
    terra_ok "Invariante cargo/área correcta."
  fi

  local duplicated
  duplicated="$(terra_db_psql "
    SELECT count(*) FROM (
      SELECT job_id, drive_node_id FROM download_items GROUP BY 1,2 HAVING count(*) > 1
    ) d;" 2>/dev/null || echo '?')"
  if [[ "$duplicated" != "0" ]]; then
    terra_error "Elementos duplicados por trabajo: $duplicated"
    failures=$((failures + 1))
  else
    terra_ok "Sin elementos duplicados por trabajo."
  fi

  local orphan
  orphan="$(terra_db_psql "
    SELECT count(*) FROM stored_files sf
    LEFT JOIN download_jobs j ON j.id = sf.job_id
    WHERE j.id IS NULL;" 2>/dev/null || echo '?')"
  if [[ "$orphan" != "0" ]]; then
    terra_error "Archivos almacenados sin trabajo asociado: $orphan"
    failures=$((failures + 1))
  else
    terra_ok "Integridad referencial de stored_files correcta."
  fi
}

e2e_tests() {
  log_section "E2E — HTTP"
  if ! terra_require_stack; then failures=$((failures + 1)); return; fi
  local base port
  port="$(terra_web_port)"
  base="http://127.0.0.1:$port"

  if curl -fsS --max-time 5 "$base/" | grep -q '<div id="root">'; then
    terra_ok "Frontend servido por Nginx."
  else
    terra_error "El frontend no responde correctamente."
    failures=$((failures + 1))
  fi

  if curl -fsS --max-time 5 "$base/api/v1/health" | grep -q '"status":"ok"'; then
    terra_ok "API sanitaria a través de Nginx."
  else
    terra_error "API /health no responde."
    failures=$((failures + 1))
  fi

  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$base/api/v1/auth/me")"
  if [[ "$code" == "401" ]]; then
    terra_ok "Ruta protegida devuelve 401 sin sesión."
  else
    terra_error "Ruta protegida devolvió $code (se esperaba 401)."
    failures=$((failures + 1))
  fi

  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$base/api/v1/public/areas")"
  if [[ "$code" == "200" ]]; then
    terra_ok "Catálogo público responde 200."
  else
    terra_error "Catálogo público devolvió $code."
    failures=$((failures + 1))
  fi

  code="$(curl -sS -o /tmp/terra-e2e-404.$$ -w '%{http_code}' --max-time 5 "$base/api/v1/ruta-inexistente")"
  if [[ "$code" == "404" ]] && grep -q '"code":"not_found"' "/tmp/terra-e2e-404.$$"; then
    terra_ok "Errores 404 usan JSON estable."
  else
    terra_error "El 404 no tiene el formato JSON esperado."
    failures=$((failures + 1))
  fi
  rm -f "/tmp/terra-e2e-404.$$"

  local headers
  headers="$(curl -sS -D - -o /dev/null --max-time 5 "$base/")"
  if grep -qi '^Content-Security-Policy:' <<<"$headers" && grep -qi '^X-Frame-Options:' <<<"$headers"; then
    terra_ok "Cabeceras de seguridad presentes en el frontend."
  else
    terra_error "Faltan cabeceras de seguridad del frontend."
    failures=$((failures + 1))
  fi
}

log_section "TERRA TEST — $TERRA_ENV ($mode)"
case "$mode" in
  unit) unit_tests ;;
  integration) integration_tests ;;
  e2e) e2e_tests ;;
  all)
    unit_tests
    integration_tests
    e2e_tests
    ;;
esac

printf '\nRegistro: %s\n' "$log" | tee -a "$log"
if ((failures > 0)); then
  terra_error "Pruebas con $failures fallo(s)."
  exit 1
fi
terra_ok "Todas las pruebas solicitadas finalizaron correctamente."
