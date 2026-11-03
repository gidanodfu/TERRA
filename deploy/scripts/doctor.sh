#!/usr/bin/env bash
# =============================================================================
# TERRA - doctor.sh
# Versión: 2.0.0
# Descripción: diagnóstico completo del entorno local en ejecución.
# Uso: ./deploy/scripts/doctor.sh
# Requisitos: Docker, Compose y .env.
# Efectos: solo lectura. Recopila estado, salud, conectividad y logs recientes.
# Códigos: 0 todo correcto · 1 se detectaron problemas · 2 uso incorrecto.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
terra_enable_traps

case "${1:-}" in -h|--help) printf 'Uso: doctor.sh\nDiagnóstico completo del entorno local.\n'; exit 0 ;; esac
[[ $# -eq 0 ]] || { terra_error "Argumentos no permitidos."; exit 2; }

issues=0
note_issue() { terra_error "$1"; issues=$((issues + 1)); }

terra_step "1. Docker y Compose"
if terra_check_env_file && terra_check_commands; then
  terra_ok "Docker, Compose y .env disponibles"
else
  note_issue "Precondiciones del host incompletas"
fi

terra_step "2. Configuración y Compose"
if terra_validate_files && terra_validate_compose; then
  terra_ok "Archivos y Compose válidos (4 servicios)"
else
  note_issue "Configuración o Compose inválidos"
fi

terra_step "3. Contenedores"
for service in "${TERRA_ALLOWED_SERVICES[@]}"; do
  status="$(terra_container_health "$service")"
  if [[ "$status" == "healthy" || "$status" == "running" ]]; then
    terra_ok "$service: $status"
  else
    note_issue "$service: $status"
  fi
done

terra_step "4. PostgreSQL"
if terra_require_db_running >/dev/null 2>&1; then
  user="$(terra_env_get POSTGRES_USER)"
  db="$(terra_env_get POSTGRES_DB)"
  if terra_compose exec -T db pg_isready -U "$user" -d "$db" >/dev/null 2>&1; then
    terra_ok "pg_isready correcto"
  else
    note_issue "pg_isready falló"
  fi
  count="$(terra_db_psql "SELECT count(*) FROM schema_migrations;" 2>/dev/null || echo '?')"
  [[ "$count" =~ ^[0-9]+$ ]] && terra_ok "Migraciones aplicadas: $count" || note_issue "No se pudo consultar schema_migrations"
else
  note_issue "PostgreSQL no está disponible"
fi

terra_step "5. API y proxy Vite"
port="$(terra_web_port)"
if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/v1/health" >/dev/null 2>&1; then
  terra_ok "GET /api/v1/health vía Vite"
else
  note_issue "API /health no responde vía Vite"
fi
if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/v1/ready" >/dev/null 2>&1; then
  terra_ok "GET /api/v1/ready"
else
  note_issue "API /ready no responde"
fi
if curl -fsS --max-time 5 "http://127.0.0.1:$port/" >/dev/null 2>&1; then
  terra_ok "Vite dev server responde"
else
  note_issue "Vite no responde en el puerto $port"
fi

terra_step "5b. Recursos Vite / React"
terra_check_web_port_mapping || note_issue "Mapeo de puerto web incorrecto"
terra_check_web_dependencies || note_issue "Dependencias del frontend no visibles"
terra_check_vite_assets "http://127.0.0.1:$port" || note_issue "Recursos de Vite/React no disponibles"

terra_step "6. Almacenamiento y volúmenes"
if terra_volume_exists; then terra_ok "Volumen PostgreSQL presente"; else note_issue "Volumen PostgreSQL ausente"; fi
storage_path="$(terra_storage_path)"
if [[ -d "$storage_path" && -w "$storage_path" ]]; then
  terra_ok "Almacenamiento local accesible: $storage_path"
else
  note_issue "Almacenamiento local no accesible: $storage_path"
fi
free="$(df -h --output=avail "$storage_path" 2>/dev/null | tail -1 | tr -d ' ')"
terra_info "Espacio libre: ${free:-?}"

terra_step "7. Errores recientes del worker"
recent="$(terra_compose logs --no-color --tail 80 worker 2>/dev/null | grep -iE 'level=ERROR|panic' | tail -5 || true)"
if [[ -n "$recent" ]]; then
  terra_warn "Se encontraron errores recientes:"
  printf '%s\n' "$recent"
else
  terra_ok "Sin errores recientes en worker"
fi

terra_step "8. Backups locales"
if [[ -n "$(terra_backups)" ]]; then
  terra_ok "Backups locales disponibles: $(terra_backups | wc -l)"
else
  terra_warn "No hay backups locales todavía."
fi

printf '\n'
if ((issues > 0)); then
  terra_error "Doctor encontró $issues problema(s). Revise los mensajes y ./terra logs."
  exit 1
fi
terra_ok "Diagnóstico completo: sin problemas detectados."
