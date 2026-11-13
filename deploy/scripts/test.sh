#!/usr/bin/env bash
# =============================================================================
# TERRA - test.sh
# Versión: 2.0.0
# Descripción: ejecuta suites de pruebas dentro de los contenedores web y api.
# Uso: ./deploy/scripts/test.sh [all|unit|integration|frontend|backend|e2e]
#                              [unit|integration]
# Requisitos: TERRA activo (./terra up). No usa Go/Node del host.
# Efectos: pruebas de solo lectura; crea una base PostgreSQL temporal ${POSTGRES_DB}_test.
#          Registra resultados en artifacts/.
# Códigos: 0 todo correcto · 1 prueba fallida · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

usage() {
  cat <<'USAGE'
Uso: test.sh [all|unit|integration|frontend|backend|e2e] [unit|integration]

  (sin argumentos) / all   ejecuta todo, incluido E2E
  unit                     backend unit + frontend unit
  integration              backend integration + frontend integration
  frontend                 lint + unit + integration + build
  backend                  backend unit + backend integration
  e2e                      Playwright dentro del contenedor web
  frontend unit            solo unitarias de frontend
  frontend integration     solo integración de frontend
  backend unit             solo unitarias de backend
  backend integration      solo integración de backend

Las pruebas usan exclusivamente los contenedores api y web.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then usage; exit 0; fi
suite="${1:-all}"
detail="${2:-}"
[[ $# -le 2 ]] || { terra_error "Demasiados argumentos."; usage; exit 2; }
case "$suite" in all|unit|integration|frontend|backend|e2e) ;; *) terra_error "Suite inválida: $suite"; usage; exit 2 ;; esac
case "$detail" in ""|unit|integration) ;; *) terra_error "Detalle inválido: $detail"; usage; exit 2 ;; esac
if [[ -n "$detail" && "$suite" != "frontend" && "$suite" != "backend" ]]; then
  terra_error "El detalle solo aplica a frontend o backend."
  exit 2
fi

terra_check_env_file
terra_check_commands
terra_require_stack

port="$(terra_web_port)"
base="http://127.0.0.1:$port"
if ! curl -fsS --max-time 5 "$base/api/v1/health" >/dev/null 2>&1; then
  terra_error "La API no responde a través de Vite. Ejecute ./terra up o ./terra init."
  exit 1
fi

mkdir -p "$TERRA_ROOT_DIR/artifacts/tests" "$TERRA_ROOT_DIR/artifacts/coverage"
log="$TERRA_ROOT_DIR/artifacts/tests/$(date -u +%Y%m%dT%H%M%SZ)-${suite}${detail:+-$detail}.log"
failures=0

run_logged() {
  "$@" 2>&1 | tee -a "$log"
  return "${PIPESTATUS[0]}"
}
section() { printf '\n===== %s =====\n' "$*" | tee -a "$log"; }
fail() { terra_error "$1"; failures=$((failures + 1)); }

backend_unit() {
  section "PRUEBAS UNITARIAS DE BACKEND (api)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T api go test -coverprofile=/tmp/backend-coverage.out ./...; then
    terra_ok "Pruebas unitarias de backend correctas."
    "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" cp api:/tmp/backend-coverage.out "$TERRA_ROOT_DIR/artifacts/coverage/backend-unit.out" >/dev/null 2>&1 || true
  else
    fail "Las pruebas unitarias de backend fallaron."
  fi
  section "GO VET (api)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T api go vet ./...; then
    terra_ok "go vet correcto."
  else
    fail "go vet falló."
  fi
}

backend_integration() {
  section "PRUEBAS DE INTEGRACIÓN DE BACKEND (api + db test)"
  user="$(terra_env_get POSTGRES_USER)"
  db="$(terra_env_get POSTGRES_DB)"
  test_db="${db}_test"
  cleanup_db() {
    "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T db psql -U "$user" -d postgres \
      -c "DROP DATABASE IF EXISTS ${test_db} WITH (FORCE);" >/dev/null 2>&1 || true
  }
  trap cleanup_db EXIT
  if ! "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T db psql -U "$user" -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS ${test_db} WITH (FORCE);" \
      -c "CREATE DATABASE ${test_db};" >>"$log" 2>&1; then
    fail "No se pudo crear la base temporal $test_db."
    return
  fi
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T -e "TEST_DATABASE_NAME=$test_db" api \
      go test -tags=integration -count=1 -coverprofile=/tmp/backend-integration.out ./tests/integration/...; then
    terra_ok "Pruebas de integración de backend correctas."
    "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" cp api:/tmp/backend-integration.out "$TERRA_ROOT_DIR/artifacts/coverage/backend-integration.out" >/dev/null 2>&1 || true
  else
    fail "Las pruebas de integración de backend fallaron."
  fi
  cleanup_db
  trap - EXIT
}

frontend_dependencies() {
  section "DEPENDENCIAS DEL FRONTEND (web)"
  if run_logged terra_check_web_dependencies; then
    :
  else
    fail "Las dependencias del frontend no coinciden con los manifiestos."
  fi
}

frontend_lint() {
  section "LINT DE FRONTEND (web)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T web npm run lint; then
    terra_ok "Lint correcto."
  else
    fail "Lint falló."
  fi
}

frontend_unit() {
  section "PRUEBAS UNITARIAS DE FRONTEND (web)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T web npm run test:unit; then
    terra_ok "Pruebas unitarias de frontend correctas."
  else
    fail "Las pruebas unitarias de frontend fallaron."
  fi
}

frontend_integration() {
  section "PRUEBAS DE INTEGRACIÓN DE FRONTEND (web)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T web npm run test:integration; then
    terra_ok "Pruebas de integración de frontend correctas."
  else
    fail "Las pruebas de integración de frontend fallaron."
  fi
}

frontend_build() {
  section "COMPILACIÓN DEL FRONTEND (web)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T web npm run build -- --outDir /tmp/terra-build --emptyOutDir; then
    terra_ok "Compilación del frontend correcta."
  else
    fail "La compilación del frontend falló."
  fi
}

frontend_coverage() {
  section "COBERTURA DEL FRONTEND (web)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T web npm run test:coverage; then
    rm -rf "$TERRA_ROOT_DIR/artifacts/coverage/frontend"
    "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" cp web:/tmp/coverage "$TERRA_ROOT_DIR/artifacts/coverage/frontend" >/dev/null 2>&1 || true
    terra_ok "Cobertura de frontend generada."
  else
    fail "La cobertura de frontend falló."
  fi
}

e2e() {
  section "PRUEBAS E2E (Playwright en web)"
  if run_logged "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
      -f "$TERRA_COMPOSE_FILE" exec -T web npm run test:e2e; then
    terra_ok "Pruebas E2E correctas."
  else
    fail "Las pruebas E2E fallaron."
  fi
  # Conserva reporte y resultados también cuando la suite falla, para que el
  # artefacto de CI incluya captura, error-context y trace.
  rm -rf "$TERRA_ROOT_DIR/artifacts/playwright-report"
  "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
    -f "$TERRA_COMPOSE_FILE" cp web:/tmp/playwright-report "$TERRA_ROOT_DIR/artifacts/playwright-report" >/dev/null 2>&1 || true
  "$TERRA_DOCKER_BIN" compose --env-file "$TERRA_ENV_FILE" --project-name "$TERRA_PROJECT" \
    -f "$TERRA_COMPOSE_FILE" cp web:/tmp/playwright-results "$TERRA_ROOT_DIR/artifacts/playwright-results" >/dev/null 2>&1 || true
}

section "TERRA TEST — $suite${detail:+ $detail}"
case "$suite" in
  all)
    backend_unit
    backend_integration
    frontend_dependencies
    frontend_lint
    frontend_unit
    frontend_integration
    frontend_coverage
    frontend_build
    e2e
    ;;
  unit)
    backend_unit
    frontend_unit
    ;;
  integration)
    backend_integration
    frontend_integration
    ;;
  backend)
    if [[ "$detail" == "unit" ]]; then backend_unit
    elif [[ "$detail" == "integration" ]]; then backend_integration
    else backend_unit; backend_integration; fi
    ;;
  frontend)
    if [[ "$detail" == "unit" ]]; then frontend_unit
    elif [[ "$detail" == "integration" ]]; then frontend_integration
    else frontend_dependencies; frontend_lint; frontend_unit; frontend_integration; frontend_build; frontend_coverage; fi
    ;;
  e2e) e2e ;;
esac

printf '\nRegistro de pruebas: %s\n' "$log" | tee -a "$log"
if ((failures > 0)); then
  terra_error "Pruebas con $failures suite(s) fallida(s)."
  exit 1
fi
terra_ok "Todas las suites solicitadas finalizaron correctamente."
