# TERRA

Sistema de gestión documental basado en Go, React, PostgreSQL y Google Drive API.

> **Distribución de desarrollo local**
>
> Este repositorio proporciona exclusivamente un entorno de desarrollo local de TERRA, ejecutado mediante Docker y Docker Compose.
>
> Permite construir, ejecutar, modificar, depurar y probar TERRA sin instalar dependencias del stack en el sistema anfitrión.
>
> La infraestructura Docker incluida está destinada exclusivamente al desarrollo local y no constituye una arquitectura de despliegue productivo.
>
> TERRA no prescribe ni proporciona una solución universal de despliegue para municipalidades, instituciones, organizaciones o servidores externos.
>
> Cada entidad que adopte el proyecto deberá definir independientemente su arquitectura de despliegue, infraestructura, seguridad, almacenamiento, redes, dominios, certificados, monitoreo y procedimientos operativos, según sus propias necesidades y políticas.
>
> La distribución local no debe utilizarse directamente como configuración de producción.

## 1. Descripción

TERRA permite que trabajadores autoricen individualmente su cuenta personal de Google
y que un administrador inicie copias controladas de su Google Drive. Los documentos se
guardan en un volumen local privado y se clasifican por **área → cargo → trabajador →
snapshot**, conservando la estructura original **Mi unidad → carpetas → archivos**.

El administrador puede respaldar **Mi unidad completa**, **carpetas completas** o
**archivos individuales combinados con carpetas**. Los archivos binarios se conservan
byte a byte y los documentos nativos de Google se exportan a formatos abiertos u
ofimáticos; Google Forms se serializa como JSON. Ver
[docs/development/file-formats.md](docs/development/file-formats.md).

## 2. Alcance de la distribución

Incluye un entorno local completo:

- cuatro servicios Docker: `web`, `api`, `worker`, `db`;
- Vite como servidor de desarrollo con HMR y proxy `/api`;
- API Go con REST y SSE;
- worker independiente con cola PostgreSQL;
- PostgreSQL con volumen persistente;
- scripts de operación local y comando unificado `./terra`;
- pruebas unitarias, integración, E2E y CI exclusivamente Docker.

No incluye Nginx de producción, Compose de producción/staging, certificados, dominios,
VPS, Traefik, Cloudflare Tunnel ni procedimientos de publicación.

## 3. Arquitectura

```
web (Vite + React) ──/api──► api (Go REST + SSE) ──► db (PostgreSQL)
                                     ▲                    ▲
                                     │                    │
                             worker (Go) ─────────────────┘
                                     │
                STORAGE_HOST_PATH (documentos externos)
```

- **web**: Vite dev server, HMR y proxy REST/SSE hacia `api:8080`.
- **api**: autenticación, RBAC, OAuth, organización, trabajos, SSE y acceso a archivos.
- **worker**: cola, leases, Drive, descargas/exportaciones y escritura atómica.
- **db**: fuente de verdad y cola persistente (`FOR UPDATE SKIP LOCKED`).

## 4. Tecnologías

| Capa | Tecnología |
|---|---|
| API / worker | Go 1.27, `net/http`, pgx |
| Frontend | React 19, Vite 8, Tailwind CSS 4, Lucide |
| Base de datos | PostgreSQL 18 |
| Integraciones | Google OAuth/OIDC, Google Drive API v3, Cloudflare Turnstile |
| Pruebas | Go testing, Vitest, React Testing Library, Playwright |
| Infraestructura | Docker Compose, exactamente 4 servicios |
| CI | GitHub Actions con Docker |

## 5. Requisitos mínimos del host

- Linux/macOS/Windows con Docker Engine o Docker Desktop.
- Docker Compose v2.
- Bash, Git, curl, tar, sha256sum.
- 2 vCPU y 4 GB de RAM recomendados.
- Espacio para imágenes, PostgreSQL y documentos.

No se requiere Go, Node, npm, PostgreSQL, Vite, compiladores ni herramientas de
pruebas en el host.

## 6. Instalación de Docker

Siga la documentación oficial de Docker para su sistema. Verifique:

```bash
docker version
docker compose version
```

## 7. Configuración `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Complete como mínimo:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DB_PORT`
- `STORAGE_HOST_PATH` y `BACKUP_HOST_PATH` (pueden quedar vacías para usar XDG/HOME)
- `SESSION_SECRET` (`openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URIs locales
- `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`)
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`

`.env.example` contiene únicamente valores locales y marcadores. Nunca se versiona
`.env`. No existen archivos `.env.production` ni `.env.staging`.

Google OAuth debe registrar:

```text
http://localhost:8080/api/v1/auth/google/callback
http://localhost:8080/api/v1/auth/google/drive/callback
```

El scope documental es `https://www.googleapis.com/auth/drive.readonly`.

## 8. Inicialización

```bash
./terra init
```

El comando valida Docker/Compose/.env, prepara almacenamiento y cachés locales,
construye imágenes faltantes, inicia PostgreSQL, aplica migraciones, ejecuta el
bootstrap, inicia worker/web y verifica los cuatro servicios.

Reconstrucción completa:

```bash
./terra init --rebuild --no-cache
```

## 9. Construcción de imágenes

```bash
./terra build
./terra build --no-cache
./terra build web
./terra build api
```

API y worker comparten `terra-backend:local` en modo desarrollo, con Go y Air.
PostgreSQL usa `postgres:18-alpine` fijado y no se reconstruye. BuildKit y los
lockfiles se respetan; las dependencias se descargan dentro de Docker.

El `backend/Dockerfile` es multi-stage: `development` incluye Go/Air y `production`
genera binarios `/app/{api,worker,migrate,bootstrap}` sin Go, Air ni código montado.

## 10. Arranque

```bash
./terra up
```

Si los contenedores fueron eliminados, los recrea reutilizando el volumen. No ejecuta
bootstrap, no reinicializa la base y no borra datos.

API y worker arrancan con Air y recargan automáticamente los cambios Go. Para aplicar
cambios de `.env` o Compose, recree solo el servicio afectado:

```bash
./terra up --recreate=api
./terra up --recreate=worker
./terra up --recreate        # todos, conservando volúmenes
```

## 11. Acceso a TERRA

```text
http://localhost:8080
```

El puerto del host se configura con `WEB_PORT`. Vite escucha en `5173` dentro del
contenedor.

## 12. Comandos de ayuda

```bash
./terra help
./terra check
./terra doctor
./terra status
```

## 13. Desarrollo frontend

Las dependencias del frontend se instalan con `npm ci` dentro de la imagen `web` y no
se montan desde el host. Un `frontend/node_modules` local es residual, no forma parte
del flujo operativo y no es necesario para ejecutar TERRA. Los comandos npm deben
ejecutarse dentro del contenedor; Node.js en el host no es un requisito.

```bash
./terra logs web -f
./terra shell web                                  # shell interactivo
docker compose exec -T web npm run test:unit       # comando individual
./terra build web && ./terra up                    # tras cambiar package.json/lockfile
```

Ver [docs/development/frontend-development.md](docs/development/frontend-development.md).

## 14. Desarrollo backend

`../backend` está montado en `/src`; API y worker arrancan con **Air** dentro de Docker.
No se requiere Go ni Air en el host.

```bash
./terra logs api -f
./terra logs worker -f
./terra shell api
go test ./...
```

Air recompila y reinicia automáticamente ante cambios en:

- `cmd/api` o `cmd/worker`, según el servicio;
- `internal/`;
- `migrations/` y SQL embebido;
- `go.mod` / `go.sum`.

No ejecute `./terra restart api` después de cada cambio Go. Los binarios temporales se
generan en `/tmp/air-api` y `/tmp/air-worker`, fuera del repositorio. Un error de
compilación detiene el binario anterior y se recupera al corregir el archivo.

| Cambio | Operación |
|---|---|
| Código Go/SQL, `go.mod`/`go.sum` | Automático con Air |
| `.env` o secretos | `./terra up --recreate=api` / `--recreate=worker` |
| Dockerfile o dependencia nativa | `./terra build api && ./terra up` |
| Migración de BD | `./terra migrate up` |

`./terra restart api` queda para diagnóstico excepcional.

Ver [docs/development/backend-development.md](docs/development/backend-development.md).

## 15. Worker

Contenedor independiente con la misma imagen backend y recarga automática:

```bash
./terra logs worker -f
```

Los cambios compartidos de `internal/` recargan API y worker; los cambios exclusivos de
`cmd/worker` no reinician la API. No es necesario reiniciar el worker tras cada cambio Go.

Ver [docs/development/worker-development.md](docs/development/worker-development.md).

## 16. PostgreSQL

```bash
./terra db
./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"
```

El volumen `terra_terra-db` es persistente. PostgreSQL solo publica en
`127.0.0.1:${DB_PORT}` (loopback, nunca `0.0.0.0`).

### Conexión desde DBeaver, pgAdmin u otro cliente

Use los valores de `.env` sin copiar la contraseña a scripts ni registros:

| Parámetro | Variable |
|---|---|
| Host | `127.0.0.1` |
| Puerto | `DB_PORT` |
| Base de datos | `POSTGRES_DB` |
| Usuario | `POSTGRES_USER` |
| Contraseña | `POSTGRES_PASSWORD` |

La API y el worker no usan esa dirección: se conectan internamente a `db:5432`.
El DSN se construye desde `POSTGRES_*`; `DATABASE_URL` ya no es necesaria.

Ver [docs/development/database-development.md](docs/development/database-development.md).

## 17. Migraciones

```bash
./terra migrate status
./terra migrate version
./terra migrate up
```

Se ejecutan dentro del contenedor `api` (`go run ./cmd/migrate`). No hay contenedor
de migraciones. Ver [docs/development/database-development.md](docs/development/database-development.md).

## 18. Pruebas

Todas las pruebas se ejecutan dentro de Docker.

```bash
./terra test
./terra test all
./terra test backend unit
./terra test backend integration
./terra test frontend unit
./terra test frontend integration
./terra test e2e
```

Incluye Go testing, `go vet`, Vitest, React Testing Library, PostgreSQL de pruebas y
Playwright con Chromium dentro de la imagen web. La base de pruebas es `terra_test`,
temporal. Resultados en `artifacts/`.

Referencia completa: [docs/development/testing.md](docs/development/testing.md).

## 19. Registros

```bash
./terra logs
./terra logs api
./terra logs worker -f
./terra logs db -n 100
```

## 20. Diagnóstico

```bash
./terra check
./terra doctor
./terra status
```

`doctor` verifica Docker, Compose, contenedores, PostgreSQL, migraciones, API, Vite,
volúmenes, almacenamiento externo, backups y errores recientes, sin mostrar secretos.

## 21. Volúmenes

| Recurso | Uso |
|---|---|
| `terra_terra-db` | PostgreSQL |
| `node_modules` de la imagen web | dependencias del frontend en el contenedor |
| `STORAGE_HOST_PATH` | documentos, snapshots y staging **fuera del repositorio** |
| `BACKUP_HOST_PATH` | copias de seguridad **fuera del repositorio** |
| `.cache/go-*` | cachés de Go |

Valores predeterminados si las rutas externas están vacías:

```text
$XDG_DATA_HOME/terra/storage
$XDG_DATA_HOME/terra/backups
# o, sin XDG_DATA_HOME:
$HOME/.local/share/terra/storage
$HOME/.local/share/terra/backups
```

Los documentos no se guardan dentro del proyecto. `./terra init` y `./terra up` crean
las rutas con permisos `0750` (documentos) y `0700` (backups).

`./terra down` detiene sin borrar datos. `./terra down --remove` elimina contenedores
y red, **nunca** volúmenes ni datos externos.

## 22. Copias de seguridad locales

```bash
./terra backup
./terra restore
./terra restore <timestamp>
./terra restore /ruta/absoluta/del/backup
```

Las copias se crean en `BACKUP_HOST_PATH/<timestamp>/` con dump de PostgreSQL,
almacenamiento, metadatos y checksums. La clave `TOKEN_ENCRYPTION_KEY` se respalda
por separado.

Para mover datos antiguos de `data/dev` y `backups/` a las rutas externas:

```bash
./terra migrate-data            # simulación
./terra migrate-data --apply    # copia, verifica y actualiza .env
```

El origen no se elimina automáticamente.

Ver [docs/development/local-backups.md](docs/development/local-backups.md).

## 23. Solución de problemas

Consulte [docs/development/troubleshooting.md](docs/development/troubleshooting.md).
Nunca elimine volúmenes para resolver un problema de arranque.

Si un cambio de backend no aparece, revise `./terra logs api` o `./terra logs worker`:
Air muestra los errores de compilación y `./terra doctor` comprueba que la recarga está
activa. Los cambios de `.env` requieren `./terra up --recreate=servicio`.

## 24. Contribución

Consulte [CONTRIBUTING.md](CONTRIBUTING.md). Toda funcionalidad nueva debe incluir
pruebas y mantener Docker como único entorno de ejecución.

## Documentación

- [Entorno Docker](docs/development/docker-environment.md)
- [Inicialización y recuperación](docs/development/initialization.md)
- [Referencia de comandos](docs/development/commands-reference.md)
- [Pruebas](docs/development/testing.md)
- [Integración continua](docs/development/continuous-integration.md)
- [Arquitectura](docs/architecture/overview.md)
- [Modelo de datos](docs/architecture/database-design.md)
- [Pipeline de descarga](docs/architecture/download-pipeline.md)
- [OpenAPI](docs/api/openapi.yaml)
- [Seguridad](docs/security/threat-model.md)

## Estado

Distribución de desarrollo local del MVP, con integración real de Google Drive API v3.
La verificación de Google del scope restringido y el consentimiento con cuentas reales
son dependencias externas documentadas en
[docs/implementation/blockers.md](docs/implementation/blockers.md). **Google no ha
aprobado ni verificado TERRA.**

## Seguridad esencial

- Refresh tokens cifrados con AES-256-GCM; nunca llegan al navegador.
- Cookies de sesión HttpOnly, SameSite=Lax y CSRF.
- Argon2id para credenciales administrativas locales.
- Turnstile validado en backend.
- Rutas documentales sanitizadas, sin traversal ni symlinks.
- Documentos accesibles solo mediante API autenticada.
