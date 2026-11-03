# Criterios de aceptación — distribución local

## Arquitectura

- [x] Un único `deploy/compose.yaml`.
- [x] Exactamente `web`, `api`, `worker`, `db`.
- [x] API y worker comparten imagen con comandos independientes.
- [x] `web` usa Vite dev server y proxy `/api`/SSE.
- [x] API monta documentos en solo lectura; worker en escritura.
- [x] PostgreSQL usa volumen persistente.
- [x] Reiniciar el stack conserva base y documentos.
- [x] Migraciones y bootstrap se ejecutan dentro de `api`.
- [x] No se requieren Go, Node, npm ni PostgreSQL en el host.

## Identidad

- [ ] Login Google y onboarding con una cuenta real (requiere redirect URIs).
- [x] Login administrativo emite sesión y cookies; CSRF obligatorio.
- [x] Turnstile inválido es rechazado.
- [x] Rate limit responde 429.
- [x] Bootstrap idempotente; no sobrescribe credenciales.
- [x] Suspensión invalida sesiones.
- [x] Cargo de otra área o inactivo rechazado.

## Drive

- [ ] Dos cuentas reales conectadas y árboles reconstruidos (manual).
- [x] Autorización con `drive.readonly`, `offline`, `consent`, PKCE y state.
- [x] Verificación del `sub` de Google.
- [x] Token inválido → `reauthorization_required` y `waiting_authorization`.
- [x] Paginación y exclusión de papelera.
- [x] Exportación nativa y descarga binaria implementadas.
- [x] Shortcuts sin ciclos ni duplicación.

## Descargas

- [x] Creación HTTP 202 sin descargar en la petición.
- [x] Trabajo independiente del navegador.
- [x] Cola con `SKIP LOCKED`, lease y recuperación.
- [x] Idempotency-Key repetida devuelve el mismo trabajo.
- [x] Cancelación en cola y transferencia.
- [x] Estados parciales/completados correctos.
- [ ] Reinicio a mitad de transferencia con Drive real (manual).
- [x] Estructura original y carpetas vacías.
- [x] Snapshots independientes.

## Almacenamiento

- [x] Traversal, rutas absolutas y symlinks rechazados por pruebas.
- [x] Colisiones con sufijo determinista.
- [x] `.part` no se publica como final.
- [x] SHA-256 y MD5 cuando existe.
- [x] Acceso 401/403 correcto.
- [x] Acceso administrativo auditado.

## Interfaz

- [x] Rutas separadas por rol.
- [x] Selector de carpetas y solapamiento.
- [x] Dashboard, historial, almacenamiento y auditoría.
- [x] SSE y fallback REST.
- [x] Estados loading/empty/error/partial/completed.
- [x] Responsive.
- [x] E2E Playwright dentro de Docker.

## Pruebas

- [x] Backend unit + `go vet` en `api`.
- [x] Backend integration con `terra_test` aislado.
- [x] Frontend unit e integration con Vitest/RTL.
- [x] Frontend lint, build y cobertura.
- [x] E2E Playwright + Chromium en `web`.
- [x] `./terra test all` ejecutado.
- [x] Resultados en `artifacts/`.

## Operación

- [x] `./terra` con check, doctor, build, init, up, down, restart, status, logs,
  shell, db, migrate, bootstrap, test, backup, restore, help.
- [x] Recuperación tras eliminar contenedores conservando el volumen.
- [x] `down --remove` conserva volúmenes.
- [x] Backup/verificación/restauración local.
- [x] `bash -n` y ShellCheck sin advertencias.
- [x] Documentación en `docs/development/`.
- [x] Dockerfile y Compose sin configuraciones de producción.
- [x] `.env.example` exclusivamente local.
- [x] `.env.production.example` eliminado.
- [x] CI Docker-only sin deploy.
