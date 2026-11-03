# TERRA

Portal interno de gestión documental para una municipalidad. Los trabajadores autorizan
individualmente su cuenta personal de Google y un administrador inicia copias controladas
de su Google Drive. Los documentos se guardan en un volumen privado del servidor y se
clasifican por **área → cargo → trabajador → snapshot**, conservando además la estructura
original **Mi unidad → carpetas → archivos**.

## Stack

| Capa | Tecnología |
|------|------------|
| API | Go 1.27, `net/http`, pgx |
| Worker | Go 1.27, proceso independiente |
| Base de datos | PostgreSQL 18 |
| Frontend | React 19, Vite 8, Tailwind CSS 4, Lucide |
| Servidor web | Nginx 1.29 (misma imagen que el frontend) |
| Integraciones | Google OAuth 2.0 / OpenID Connect, Google Drive API v3, Cloudflare Turnstile |
| Infraestructura | Docker Compose, exactamente 4 servicios |

## Arquitectura

```
web (React + Nginx) ──/api──► api (Go REST + SSE) ──► db (PostgreSQL)
                                    ▲                    ▲
                                    │                    │
                            worker (Go) ─────────────────┘
                                    │
                          volumen documental privado
```

- **web**: sirve el SPA y enruta `/api` y SSE hacia `api`.
- **api**: autenticación, RBAC, organización, OAuth, creación/cancelación de trabajos, SSE y acceso autorizado a archivos.
- **worker**: reclama trabajos con leases, recorre Drive, descarga/exporta, valida checksums y escribe atómicamente.
- **db**: fuente de verdad y cola persistente (`FOR UPDATE SKIP LOCKED`).

No hay Redis ni broker externo. Las migraciones se aplican desde la API y el worker con un
lock de asesoría de PostgreSQL. El bootstrap del primer administrador es un comando explícito
dentro del contenedor `api`.

## Inicio rápido (desarrollo)

Requisitos: Docker + Docker Compose. No hace falta Go, Node ni PostgreSQL locales.

```bash
cp .env.example .env   # complete credenciales reales de desarrollo
# edite APP_PUBLIC_URL, GOOGLE_*, TURNSTILE_*, TOKEN_ENCRYPTION_KEY, SESSION_SECRET,
# DATABASE_URL y BOOTSTRAP_ADMIN_*
mkdir -p data/dev/staging data/dev/areas
chmod 750 data/dev data/dev/staging data/dev/areas

docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml up -d --build
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml exec -T api /app/bootstrap

# Abra http://localhost:8080
```

El bootstrap crea **una sola vez** el administrador y exige rotar la contraseña inicial.
Volver a ejecutarlo no sobrescribe credenciales.

### Redirect URIs de Google

Registre exactamente estas URLs en el cliente OAuth (tipo **External**):

```
http://localhost:8080/api/v1/auth/google/callback
http://localhost:8080/api/v1/auth/google/drive/callback
```

En producción use HTTPS y las URLs equivalentes del dominio institucional.

## Documentación

- [Plan de implementación](docs/implementation/PLAN.md)
- [Progreso y resultados de pruebas](docs/implementation/progress.md)
- [Bloqueadores externos](docs/implementation/blockers.md)
- [Arquitectura](docs/architecture/overview.md)
- [Modelo de datos](docs/architecture/database-design.md)
- [Pipeline de descarga](docs/architecture/download-pipeline.md)
- [Contrato OpenAPI](docs/api/openapi.yaml)
- [Seguridad](docs/security/threat-model.md)
- [Instalación](docs/operations/installation.md)
- [Despliegue](docs/operations/deployment.md)
- [Backup y restauración](docs/operations/backup-restore.md)
- [Estrategia de pruebas](docs/testing/strategy.md)

## Estado

Implementación completa del MVP según la especificación, con integración **real** de Google
Drive API v3 y OAuth. Las pruebas automatizadas cubren las piezas críticas y el pipeline fue
verificado con un flujo controlado. La autorización OAuth real de una cuenta de Google y la
verificación de scopes restringidos dependen de acciones externas documentadas en
`docs/implementation/blockers.md`. **Google no ha aprobado ni verificado TERRA todavía.**

## Seguridad esencial

- Los refresh tokens se cifran con AES-256-GCM usando `TOKEN_ENCRYPTION_KEY`, nunca se envían al navegador y nunca se registran.
- Cookies de sesión `HttpOnly`, `SameSite=Lax`, `Secure` en producción, con token CSRF.
- Contraseñas locales con Argon2id y rotación obligatoria.
- Turnstile se valida en el servidor (`Siteverify`); el widget por sí solo no autoriza nada.
- Rutas documentales sanitizadas por segmento, sin symlinks, con contención dentro de `STORAGE_ROOT`.
- El volumen documental no se expone por Nginx; toda lectura pasa por la API autenticada y auditada.

## Operación

Scripts en `deploy/scripts/`:

```
init-storage.sh        # crea y asigna permisos al volumen (producción, requiere root)
bootstrap.sh           # primer administrador (idempotente)
backup.sh              # PostgreSQL + volumen + checksums
verify-backup.sh       # verifica integridad sin restaurar
restore-db.sh          # restauración destructiva de PostgreSQL
restore-storage.sh     # restauración destructiva del volumen
consistency-check.sh   # compara stored_files con el disco
retention.sh           # retención de snapshots (dry-run por defecto)
```
