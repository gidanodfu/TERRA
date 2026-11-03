# Referencias oficiales consultadas

Fecha de revisión de versiones: **2026-11-03**.

## Versiones adoptadas

| Tecnología | Versión | Fuente de versión |
|---|---|---|
| Go | 1.27.3 | `go.dev/VERSION` |
| PostgreSQL | 18 (imagen `postgres:18-alpine`) | Docker Hub |
| React | 19.3.1 | npm registry |
| Vite | 8.3.5 | npm registry |
| `@vitejs/plugin-react` | 6.2.1 | npm registry |
| Tailwind CSS / plugin Vite | 4.3.4 | npm registry |
| React Router | 7.18.5 | npm registry |
| Lucide React | 1.67.0 | npm registry |
| Nginx | 1.29-alpine | Docker Hub |
| Node (build) | 24-alpine | Docker Hub |
| Docker / Compose | 29.9.2 / v5.6.1 | entorno de construcción |
| pgx | v5.8.0 | `go.mod` |
| `golang.org/x/oauth2` | v0.36.0 | `go.mod` |
| `google.golang.org/api` | v0.260.0 | `go.mod` |
| `golang.org/x/crypto` | v0.46.0 | `go.mod` |
| `github.com/google/uuid` | v1.6.0 | `go.mod` |

## Go

- https://go.dev/doc/
- https://go.dev/doc/tutorial/create-module
- https://pkg.go.dev/context
- https://pkg.go.dev/database/sql
- https://github.com/jackc/pgx (documentación oficial del driver PostgreSQL usado)
- https://pkg.go.dev/net/http (ServeMux con patrones por método, usado en `server/router.go`)

Decisiones derivadas: un módulo Go, `context` en I/O, `go:embed` para migraciones, `net/http` sin
framework, `database/sql` compatible vía pgx.

## React / Vite / Tailwind

- https://react.dev/learn
- https://react.dev/reference/react
- https://vite.dev/guide/
- https://vite.dev/guide/env-and-mode
- https://tailwindcss.com/docs
- https://tailwindcss.com/docs/installation/using-vite

Decisiones derivadas:

- Vite solo expone variables `VITE_*` al navegador; la única es la site key pública.
- Tailwind 4 se integra con `@tailwindcss/vite` y CSS-first (`@import "tailwindcss"`).
- Las variables de entorno de compilación se pasan como build args, nunca secretos.

## PostgreSQL

- https://www.postgresql.org/docs/
- https://www.postgresql.org/docs/current/sql-constraints.html
- https://www.postgresql.org/docs/current/sql-indexes.html
- https://www.postgresql.org/docs/current/transaction-iso.html
- https://www.postgresql.org/docs/current/explicit-locking.html
- https://www.postgresql.org/docs/current/datatype-json.html
- https://www.postgresql.org/docs/current/backup-dump.html
- https://www.postgresql.org/docs/current/app-pgrestore.html

Decisiones derivadas:

- `FOR UPDATE OF j SKIP LOCKED` para una cola segura (el `OF` evita el error en el lado nullable
  del `LEFT JOIN`).
- FK compuesta para garantizar cargo dentro del área.
- JSONB para metadata de auditoría/eventos.
- Migraciones con advisory lock y transacción por archivo.
- PostgreSQL 18 cambió la ruta recomendada del volumen a `/var/lib/postgresql`; el Compose la usa.

## Docker

- https://docs.docker.com/
- https://docs.docker.com/compose/
- https://docs.docker.com/build/building/multi-stage/
- https://docs.docker.com/compose/compose-file/
- https://docs.docker.com/engine/reference/builder/

Decisiones derivadas:

- Multi-stage para Go y frontend.
- Healthchecks y `depends_on: condition: service_healthy`.
- `read_only`, `tmpfs`, `no-new-privileges`, usuario no root.
- Separación dev/prod con archivos de override.
- Secretos fuera de la imagen.

## Google OAuth

- https://developers.google.com/identity/protocols/oauth2
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/identity/openid-connect/openid-connect

Decisiones derivadas:

- Authorization Code Flow desde backend, con PKCE y state de un solo uso.
- `access_type=offline` y `prompt=consent` para obtener refresh token.
- Aplicación External para cuentas personales.
- Verificación de `sub`/`email_verified`; no confiar solo en el frontend.
- Verificación de scope restringido pendiente; no se declara aprobación.

## Google Drive API v3

- https://developers.google.com/workspace/drive/api/guides/search-files
- https://developers.google.com/workspace/drive/api/guides/about-files
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/workspace/drive/api/guides/ref-export-formats
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export

Decisiones derivadas:

- Paginación con `nextPageToken` y `pageSize` acotado.
- `trashed = false` en las consultas.
- Exportación Docs→DOCX, Sheets→XLSX, Slides→PPTX.
- `alt=media` para binarios y comprobación de `capabilities.canDownload`.
- Límites de exportación y tamaño controlados por configuración; los errores se registran por elemento.
- No se usa Google Picker en el MVP; el selector propio valida pertenencia al árbol.

## Cloudflare Turnstile

- https://developers.cloudflare.com/turnstile/get-started/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/turnstile/troubleshooting/testing/

Decisiones derivadas:

- Render explícito del widget y verificación Siteverify en backend.
- Validación de `success`, `action`, `hostname`.
- Tokens de un solo uso; fallo cerrado si Cloudflare no responde.
- Rate limiting adicional independiente.

## Notas de verificación

- No se afirma que Google haya verificado ni aprobado TERRA.
- Las claves OAuth/Turnstile entregadas para desarrollo deben rotarse antes de producción.
- Las versiones se fijaron en `go.mod`, `package-lock.json`, Dockerfiles y Compose.
- Las pruebas de integración reales con Google requieren redirect URIs registradas y consentimiento
  del propietario de la cuenta; ver `docs/implementation/blockers.md`.
