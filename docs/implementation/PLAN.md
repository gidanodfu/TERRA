# Plan de implementación — distribución de desarrollo local

Estado: **implementado y validado localmente**. La distribución usa exclusivamente
Docker y no incluye despliegue productivo.

## Fase 0 — Análisis y planificación

- [x] Requisitos funcionales, no funcionales y criterios de aceptación.
- [x] Arquitectura modular y decisiones (ADR).
- [x] Identificación de dependencias externas y pruebas.

## Fase 1 — Plataforma Docker local

- [x] `deploy/compose.yaml` único con exactamente `web`, `api`, `worker`, `db`.
- [x] `web` con Vite dev server, HMR y proxy `/api`/SSE hacia `api:8080`.
- [x] `api` y `worker` con imagen backend compartida y comandos independientes.
- [x] Go, Node, npm y PostgreSQL dentro de contenedores.
- [x] PostgreSQL 18 con volumen persistente.
- [x] Migraciones embebidas dentro de `api`.
- [x] `.env` y `.env.example` exclusivamente locales.
- [x] `./terra` como interfaz única.

## Fase 2 — Identidad y administración

- [x] OAuth Google, sesiones, CSRF, Turnstile y RBAC.
- [x] Onboarding, perfiles, áreas, cargos e historial.
- [x] Bootstrap idempotente del primer administrador.
- [x] Auditoría de operaciones sensibles.

## Fase 3 — Google Drive

- [x] OAuth documental separado con `drive.readonly`.
- [x] Refresh tokens cifrados AES-256-GCM.
- [x] Metadatos, paginación, exploración de Mi unidad, shortcuts y exportación.
- [x] Estados de conexión y reautorización.

## Fase 4 — Motor de descargas

- [x] Cola PostgreSQL con `SKIP LOCKED`, lease, heartbeat e idempotencia.
- [x] Descarga/exportación, checksums, escritura atómica y snapshots.
- [x] Cancelación, reintentos y fallos parciales.
- [x] Limitación de velocidad por cuenta y límites de capacidad.

## Fase 5 — Aplicación

- [x] Panel trabajador y panel administrativo responsive.
- [x] Selector de carpetas, historial, dashboard, almacenamiento y auditoría.
- [x] SSE con fallback REST y estados completos.

## Fase 6 — Calidad, pruebas y CI

- [x] Pruebas unitarias backend y frontend.
- [x] Pruebas de integración backend con PostgreSQL aislado (`terra_test`).
- [x] Pruebas de integración frontend con Vitest/RTL.
- [x] E2E con Playwright y Chromium dentro de Docker.
- [x] Cobertura en `artifacts/`.
- [x] `.github/workflows/ci.yml` exclusivamente Docker.
- [x] `bash -n`, ShellCheck y validación de Compose.

## Fase 7 — Operación local

- [x] Scripts `check`, `doctor`, `build`, `init`, `up`, `down`, `restart`, `status`,
  `logs`, `shell`, `db`, `migrate`, `bootstrap`, `test`, `backup-local`,
  `restore-local`, `help`.
- [x] Recuperación tras eliminar contenedores conservando volúmenes.
- [x] Backups y restauración local verificados.
- [x] Documentación en `docs/development/`.

## Correspondencia

| Área | Módulos |
|---|---|
| Identidad | `internal/auth`, `internal/users` |
| Organización | `internal/organization` |
| Drive | `internal/drive` |
| Descargas/worker | `internal/downloads`, `internal/storage` |
| Administración | `internal/admin`, `internal/audit` |
| HTTP | `internal/server` |
| Frontend | `frontend/src`, `frontend/tests` |
| Infraestructura local | `deploy/`, `terra` |
