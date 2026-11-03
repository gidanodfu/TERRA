# Plan de implementación de TERRA

Estado global: **MVP implementado y verificado localmente**. Las dependencias externas
pendientes están en `blockers.md`.

## Fase 0 — Análisis y planificación

| Entregable | Ubicación | Estado |
|---|---|---|
| Requisitos funcionales y no funcionales | `docs/requirements/` | Completado |
| Criterios de aceptación | `docs/requirements/acceptance-criteria.md` | Completado |
| Módulos y dependencias | `docs/architecture/backend-architecture.md` | Completado |
| Decisiones arquitectónicas | `docs/decisions/ADR-*.md` | Completado |
| Bloqueadores externos | `docs/implementation/blockers.md` | Completado |

## Fase 1 — Plataforma e infraestructura

Tareas:

- [x] Repositorio con `backend/`, `frontend/`, `deploy/`, `docs/`.
- [x] Módulo Go único con dos entrypoints: `cmd/api`, `cmd/worker` (+ `cmd/bootstrap`).
- [x] React + Vite + Tailwind configurados y compilando.
- [x] Nginx dentro de la imagen `web`; `/api` y SSE enrutados a `api`.
- [x] Cuatro servicios exactos en Compose y overrides dev/prod.
- [x] PostgreSQL 18 con volumen persistente y healthcheck.
- [x] Migraciones embebidas y aplicadas con advisory lock.
- [x] Configuración centralizada y validación fail-fast.
- [x] Logger estructurado.
- [x] Almacenamiento persistente con permisos no root.
- [x] Bootstrap idempotente del primer administrador.
- [x] Contenedores no root, read-only cuando es viable, límites de recursos.

Aceptación: `docker compose config` válido; los cuatro servicios inician; migraciones aplicadas;
frontend servido; API y worker sanos; reinicio conserva datos.

## Fase 2 — Identidad y administración

- [x] OAuth Google para identidad (`openid email profile`), verificación de correo.
- [x] Login local de administradores con Argon2id.
- [x] Turnstile Siteverify con validación de acción/hostname configurables.
- [x] Rate limiting por IP e identidad.
- [x] Sesiones server-side, cookies HttpOnly, CSRF por token de sesión.
- [x] RBAC `admin`/`user` separado de los cargos.
- [x] Onboarding obligatorio con validación por campo.
- [x] Áreas, cargos, estados de usuario e historial organizativo.
- [x] Invalidación de sesiones ante suspensión/desactivación (trigger PostgreSQL).
- [x] Auditoría inicial.

## Fase 3 — Integración Google Drive

- [x] OAuth separado de Drive con `access_type=offline`, `prompt=consent`, PKCE y state de un solo uso.
- [x] Verificación de que la cuenta autorizada coincide con el `sub` de Google de la sesión.
- [x] Refresh token cifrado con AES-256-GCM.
- [x] Detección de `invalid_grant`, estado `reauthorization_required` y bloqueo de trabajos.
- [x] Desconexión con revocación best-effort y conservación del historial.
- [x] Consentimiento institucional versionado, aceptado solo por el trabajador.
- [x] Adaptador Drive API v3: metadatos, paginación, `nextPageToken`, exclusión de papelera.
- [x] Explorador administrativo de carpetas y validación de pertenencia a Mi unidad.
- [x] Normalización de carpetas solapadas (se conserva solo la raíz padre).
- [x] Exportación de Docs/Sheets/Slides a DOCX/XLSX/PPTX y descarga binaria con `alt=media`.
- [x] Atajos registrados como referencia, sin duplicar contenido ni ciclos.

## Fase 4 — Motor de descargas

- [x] Cola persistente en PostgreSQL con `FOR UPDATE OF j SKIP LOCKED`.
- [x] Lease, heartbeat, expiración y recuperación de trabajos abandonados.
- [x] Idempotencia por `(requested_by_user_id, idempotency_key)` + header `Idempotency-Key`.
- [x] Mi unidad completa y carpetas seleccionadas.
- [x] Recorrido recursivo paginado, carpetas vacías, nombres duplicados con sufijo por ID.
- [x] Limitador de inicio de descargas compartido por conexión (`DOWNLOAD_MIN_INTERVAL_MS`).
- [x] Concurrencia global y por cuenta; reintentos con backoff, jitter y `Retry-After`.
- [x] Streaming a `.part`, SHA-256, MD5 cuando existe, validación de tamaño, rename atómico.
- [x] Cancelación entre archivos y durante transferencias (context cancellation + heartbeat).
- [x] Estados parciales, omitidos con razón y fallos por elemento.
- [x] Snapshots independientes por UUID de trabajo; no se sobrescriben snapshots de otros trabajos.

## Fase 5 — Aplicación y administración

- [x] Dashboard administrativo con métricas operativas.
- [x] Panel del trabajador: inicio, perfil, Drive, historial, documentos, seguridad.
- [x] Panel administrativo: trabajadores, organización, conexiones, descargas, trabajos, almacenamiento, auditoría, política.
- [x] Selector de carpetas con navegación y selección múltiple.
- [x] SSE con snapshot, eventos y `Last-Event-ID`; fallback REST.
- [x] Explorador lógico de documentos almacenados.
- [x] Descarga de documentos por endpoint autenticado y auditado.
- [x] Estados loading, empty, error, partial, completed.
- [x] Diseño responsive con navegación móvil.

## Fase 6 — Seguridad, QA y producción

- [x] Pruebas unitarias de sanitización de rutas, crypto, password, limiter, backoff, Turnstile, exportaciones.
- [x] Pruebas de integración manuales de login, CSRF, RBAC, rate limit, idempotencia, cola y reautenticación.
- [x] Scripts de backup, verificación, restauración, consistencia y retención.
- [x] Documentación operativa.
- [x] Separación de secretos y configuración de producción.
- [ ] Verificación de Google para scope restringido (`drive.readonly`) — externa.
- [ ] Aprobación institucional del texto de política y de los límites de producción — externa.
- [ ] Prueba OAuth real con cuentas personales en navegador — pendiente de redirect URIs y consentimiento.

## Correspondencia requisitos → módulos

| Requisito | Módulo |
|---|---|
| Identidad Google, sesiones, CSRF, Turnstile | `internal/auth`, `internal/platform/*` |
| Perfiles y estados | `internal/users` |
| Áreas, cargos, historial | `internal/organization` |
| OAuth Drive, metadatos, carpetas, exportación | `internal/drive` |
| Cola, worker, SSE, archivos | `internal/downloads` |
| Rutas y escritura atómica | `internal/storage` |
| Dashboard, gestión de trabajadores | `internal/admin` |
| Auditoría | `internal/audit` |
| Contratos HTTP | `internal/server`, handlers por módulo |
| UI | `frontend/src` |
