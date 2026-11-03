#!/usr/bin/env bash
# =============================================================================
# TERRA - help.sh
# Versión: 1.0.0
# Descripción: referencia rápida de comandos operativos oficiales.
# Uso: ./deploy/scripts/help.sh
# Efectos: solo lectura.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

cat <<'EOF'
TERRA — comandos operativos oficiales
=====================================

Los ambientes son explícitos: dev | prod. Ejecute desde cualquier directorio.

PRIMERA INSTALACIÓN
  ./deploy/scripts/init.sh dev

RECONSTRUIR IMÁGENES
  ./deploy/scripts/build.sh dev
  ./deploy/scripts/build.sh dev --no-cache

RECONSTRUIR Y ARRANCAR TRAS ELIMINAR CONTENEDORES
  ./deploy/scripts/init.sh dev --rebuild --no-cache

ARRANQUE HABITUAL
  ./deploy/scripts/up.sh dev

DETENER (conserva datos)
  ./deploy/scripts/down.sh dev
  ./deploy/scripts/down.sh dev --remove   # elimina contenedores, NO volúmenes

REINICIAR
  ./deploy/scripts/restart.sh dev
  ./deploy/scripts/restart.sh dev api
  ./deploy/scripts/restart.sh dev worker

ESTADO
  ./deploy/scripts/status.sh dev

LOGS
  ./deploy/scripts/logs.sh dev
  ./deploy/scripts/logs.sh dev api -n 200
  ./deploy/scripts/logs.sh dev worker -f

VALIDACIÓN
  ./deploy/scripts/check.sh dev

MIGRACIONES
  ./deploy/scripts/migrate.sh dev status
  ./deploy/scripts/migrate.sh dev version
  ./deploy/scripts/migrate.sh dev up

BOOTSTRAP
  ./deploy/scripts/bootstrap.sh dev

PRUEBAS
  ./deploy/scripts/test.sh dev unit
  ./deploy/scripts/test.sh dev integration
  ./deploy/scripts/test.sh dev e2e
  ./deploy/scripts/test.sh dev all

BACKUP
  ./deploy/scripts/backup.sh dev
  BACKUP_GPG_RECIPIENT=cuenta@example.org ./deploy/scripts/backup.sh dev

RESTAURACIÓN
  ./deploy/scripts/restore.sh dev backups/dev/<timestamp>
  CONFIRM=yes ./deploy/scripts/restore.sh dev backups/dev/<timestamp> --db

PRODUCCIÓN
  ./deploy/scripts/init.sh prod --allow-empty-db   # solo primera instalación autorizada
  CONFIRM=yes CONFIRM_PROD="RESTORE PROD" ./deploy/scripts/restore.sh prod <backup>
  cp .env.production.example .env.production

REGLAS
  - Nunca se ejecuta docker compose down -v.
  - Nunca se eliminan volúmenes desde estos scripts.
  - down.sh conserva los datos.
  - init.sh reutiliza volúmenes existentes.
  - La clave TOKEN_ENCRYPTION_KEY se respalda por separado.
EOF
