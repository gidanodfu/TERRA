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

BACKUP Y RESTAURACIÓN
  ./terra backup
  ./terra restore
  ./terra restore backups/<timestamp>
  ./terra restore backups/<timestamp> --db

REGLAS
  - Todo el stack se ejecuta en Docker.
  - No se requieren Go, Node, npm ni PostgreSQL en el host.
  - Los scripts nunca eliminan volúmenes automáticamente.
  - Los documentos y la base de datos se conservan al detener o eliminar contenedores.

Documentación: docs/development/
HELP
