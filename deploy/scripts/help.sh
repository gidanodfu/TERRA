#!/usr/bin/env bash
# =============================================================================
# TERRA - help.sh
# Versión: 2.0.0
# Descripción: referencia rápida del entorno local.
# Uso: ./deploy/scripts/help.sh
# Efectos: solo lectura.
# =============================================================================
set -Eeuo pipefail
# shellcheck source=_common.sh
# shellcheck disable=SC1091
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

cat <<'HELP'
TERRA — distribución de desarrollo local
========================================

Comando principal:
  ./terra <comando>

PRIMERA INSTALACIÓN
  ./terra init
  ./terra init --rebuild --no-cache

CONSTRUCCIÓN
  ./terra build
  ./terra build --no-cache
  ./terra build web
  ./terra build api

ARRANQUE Y DETENCIÓN
  ./terra up
  ./terra up --recreate=api
  ./terra up --recreate=worker
  ./terra up --recreate          # todos, conservando volúmenes
  ./terra down
  ./terra down --remove      # elimina contenedores, NO volúmenes
  ./terra restart
  ./terra restart api

DIAGNÓSTICO
  ./terra check
  ./terra doctor
  ./terra status
  ./terra logs
  ./terra logs api
  ./terra logs worker -f

SHELLS
  ./terra shell api
  ./terra shell worker
  ./terra shell web
  ./terra shell db
  ./terra db
  ./terra db -c "SELECT now();"

MIGRACIONES Y BOOTSTRAP
  ./terra migrate up
  ./terra migrate status
  ./terra migrate version
  ./terra bootstrap

PRUEBAS
  ./terra test
  ./terra test all
  ./terra test backend unit
  ./terra test backend integration
  ./terra test frontend unit
  ./terra test frontend integration
  ./terra test e2e

ALMACENAMIENTO Y MIGRACIÓN
  ./terra migrate-data --dry-run
  ./terra migrate-data --apply
  ./terra doctor

COPIAS DE SEGURIDAD Y RESTAURACIÓN
  ./terra backup
  ./terra restore
  ./terra restore <timestamp>
  ./terra restore <timestamp> --db
  ./terra restore /ruta/absoluta/del/backup

REGLAS
  - Todo el stack se ejecuta en Docker.
  - API y worker recargan código Go con Air; no requieren reinicio manual.
  - Los cambios de .env requieren ./terra up --recreate=servicio.
  - No se requieren Go, Node, npm ni PostgreSQL en el host.
  - Los scripts nunca eliminan volúmenes automáticamente.
  - Documentos y backups viven fuera del repositorio (STORAGE_HOST_PATH y BACKUP_HOST_PATH).
  - Los documentos y la base de datos se conservan al detener o eliminar contenedores.

Documentación: docs/development/
HELP
