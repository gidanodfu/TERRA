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

# Instalación y ejecución

Los scripts de `deploy/scripts/` son el mecanismo operativo oficial. No hace falta ejecutar
comandos Docker manuales ni tener Go, Node o PostgreSQL instalados en el host.

## 1. Requisitos del sistema

- Linux con Docker Engine **24+** y Docker Compose **2.20+**.
- 2 vCPU y 4 GB de RAM recomendados como mínimo operativo.
- Espacio libre suficiente para PostgreSQL, imágenes y documentos.
- Conectividad HTTPS saliente hacia Google y Cloudflare.
- `curl`, `tar`, `sha256sum` y utilidades estándar.
- Puerto 8080 libre en desarrollo (configurable con `WEB_PORT`).

Detalle: [docs/operations/prerequisites.md](docs/operations/prerequisites.md).

## 2. Instalación de Docker

Siga la documentación oficial de Docker para su distribución. Verifique:

```bash
docker version
docker compose version
```

Debe existir el plugin `docker compose` (Compose v2). No se admite solo `docker-compose`.

## 3. Clonación del repositorio

```bash
git clone https://github.com/gidanodfu/TERRA.git
cd TERRA
```

Todos los scripts resuelven la raíz automáticamente y funcionan desde cualquier directorio.

## 4. Configuración de `.env`

Desarrollo:

```bash
cp .env.example .env
chmod 600 .env
```

Complete como mínimo:

- `APP_PUBLIC_URL`
- `DATABASE_URL`, `POSTGRES_PASSWORD`
- `SESSION_SECRET` (`openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`, `GOOGLE_DRIVE_REDIRECT_URL`
- `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`)
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME`
- `STORAGE_HOST_PATH`
- `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`
- límites de capacidad aprobados

Producción usa un archivo separado, nunca el mismo:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

## 5. Preparación de Google OAuth

1. Cree un cliente OAuth **External** (cuentas personales, no Internal).
2. Habilite Google Drive API v3.
3. Registre exactamente:

```text
http://localhost:8080/api/v1/auth/google/callback
http://localhost:8080/api/v1/auth/google/drive/callback
```

En producción use HTTPS y las URLs equivalentes del dominio institucional.
El scope documental es `https://www.googleapis.com/auth/drive.readonly` y requiere verificación
de Google antes de uso general. Ver [docs/security/oauth-drive.md](docs/security/oauth-drive.md).

## 6. Preparación de Turnstile

Cree un widget de Cloudflare Turnstile para el hostname real y configure:

```dotenv
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
TURNSTILE_HOSTNAME=localhost
TURNSTILE_ACTION=admin_login
```

La site key se compila en el frontend; el secret nunca sale del backend.

## 7. Inicialización del proyecto

Primera instalación en desarrollo:

```bash
./deploy/scripts/init.sh dev
```

Producción (solo con autorización explícita para crear una base vacía):

```bash
./deploy/scripts/init.sh prod --allow-empty-db
# Automatización: CONFIRM_PROD="INIT PROD" ./deploy/scripts/init.sh prod --allow-empty-db
```

El script valida el entorno, prepara el volumen, construye imágenes, inicia PostgreSQL, aplica
migraciones, ejecuta el bootstrap, inicia worker/web y verifica los cuatro healthchecks.

## 8. Construcción de imágenes

```bash
./deploy/scripts/build.sh dev
./deploy/scripts/build.sh dev --no-cache
```

API y worker comparten la imagen backend; PostgreSQL usa una versión fijada y no se reconstruye.
La construcción nunca toca volúmenes ni datos.

## 9. Creación e inicio de contenedores

Después de la primera inicialización:

```bash
./deploy/scripts/up.sh dev
```

Si los contenedores fueron eliminados pero el volumen de PostgreSQL permanece, `up.sh` los
recrea. La recuperación completa con reconstrucción de imágenes se hace con:

```bash
./deploy/scripts/init.sh dev --rebuild
```

## 10. Bootstrap del administrador

`init.sh` lo ejecuta automáticamente. Para ejecutarlo de nuevo de forma idempotente:

```bash
./deploy/scripts/bootstrap.sh dev
```

No duplica administradores ni sobrescribe contraseñas. La contraseña inicial debe rotarse en
el primer acceso. Ver [docs/operations/bootstrap.md](docs/operations/bootstrap.md).

## 11. Acceso a la aplicación

```text
http://127.0.0.1:8080
```

El administrador se crea con `BOOTSTRAP_ADMIN_USERNAME` y `BOOTSTRAP_ADMIN_PASSWORD`.

## 12. Comprobación de servicios

```bash
./deploy/scripts/check.sh dev
./deploy/scripts/status.sh dev
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/ready
```

Los cuatro servicios deben aparecer `healthy`.

## 13. Consulta de logs

```bash
./deploy/scripts/logs.sh dev
./deploy/scripts/logs.sh dev api
./deploy/scripts/logs.sh dev worker -f
./deploy/scripts/logs.sh dev db -n 100
```

## 14. Detención

```bash
./deploy/scripts/down.sh dev
```

Detiene los contenedores y conserva volúmenes y documentos. `--remove` elimina contenedores y
red, pero **nunca** los volúmenes.

## 15. Reinicio

```bash
./deploy/scripts/restart.sh dev
./deploy/scripts/restart.sh dev api
./deploy/scripts/restart.sh dev worker
```

## 16. Actualización

```bash
./deploy/scripts/backup.sh dev
./deploy/scripts/build.sh dev
./deploy/scripts/up.sh dev
```

La API aplica migraciones al arrancar. Para cambios de esquema delicados, consulte
[docs/operations/migrations.md](docs/operations/migrations.md).

## 17. Backups

```bash
./deploy/scripts/backup.sh dev
./deploy/scripts/verify-backup.sh backups/dev/<timestamp>
```

Genera dump de PostgreSQL, archivo del volumen documental, metadatos y checksums, sin sobrescribir
backups anteriores. `TOKEN_ENCRYPTION_KEY` se respalda por separado.

## 18. Restauración

```bash
CONFIRM=yes ./deploy/scripts/restore.sh dev backups/dev/<timestamp>
CONFIRM=yes CONFIRM_PROD="RESTORE PROD" ./deploy/scripts/restore.sh prod backups/prod/<timestamp>
```

Restaura PostgreSQL, almacenamiento o ambos, con verificación previa y confirmación explícita.
Procedimiento completo: [docs/operations/backup-restore.md](docs/operations/backup-restore.md).

## Comandos frecuentes

```bash
./deploy/scripts/help.sh
./deploy/scripts/migrate.sh dev status
./deploy/scripts/migrate.sh dev up
./deploy/scripts/test.sh dev all
./deploy/scripts/consistency-check.sh dev
```

## Documentación operativa

- [Requisitos](docs/operations/prerequisites.md)
- [Instalación](docs/operations/installation.md)
- [Primer arranque](docs/operations/first-start.md)
- [Operación diaria](docs/operations/daily-operations.md)
- [Referencia de scripts](docs/operations/scripts-reference.md)
- [Configuración por ambiente](docs/operations/environment-configuration.md)
- [Arquitectura Docker](docs/operations/docker-architecture.md)
- [Migraciones](docs/operations/migrations.md)
- [Bootstrap](docs/operations/bootstrap.md)
- [Backup y restauración](docs/operations/backup-restore.md)
- [Troubleshooting](docs/operations/troubleshooting.md)
- [Despliegue en producción](docs/operations/production-deployment.md)

## Documentación del producto

- [Plan de implementación](docs/implementation/PLAN.md)
- [Progreso y resultados de pruebas](docs/implementation/progress.md)
- [Bloqueadores externos](docs/implementation/blockers.md)
- [Arquitectura](docs/architecture/overview.md)
- [Modelo de datos](docs/architecture/database-design.md)
- [Pipeline de descarga](docs/architecture/download-pipeline.md)
- [Contrato OpenAPI](docs/api/openapi.yaml)
- [Seguridad](docs/security/threat-model.md)
- [Estrategia de pruebas](docs/testing/strategy.md)

## Estado

Implementación completa del MVP según la especificación, con integración **real** de Google
Drive API v3 y OAuth. La autorización OAuth real de una cuenta de Google y la verificación de
scopes restringidos dependen de acciones externas documentadas en
`docs/implementation/blockers.md`. **Google no ha aprobado ni verificado TERRA todavía.**

## Seguridad esencial

- Los refresh tokens se cifran con AES-256-GCM usando `TOKEN_ENCRYPTION_KEY`, nunca se envían al navegador y nunca se registran.
- Cookies de sesión `HttpOnly`, `SameSite=Lax`, `Secure` en producción, con token CSRF.
- Contraseñas locales con Argon2id y rotación obligatoria.
- Turnstile se valida en el servidor (`Siteverify`); el widget por sí solo no autoriza nada.
- Rutas documentales sanitizadas por segmento, sin symlinks, con contención dentro de `STORAGE_ROOT`.
- El volumen documental no se expone por Nginx; toda lectura pasa por la API autenticada y auditada.
- Los scripts nunca ejecutan `docker compose down -v` ni eliminan volúmenes.
