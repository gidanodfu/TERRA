# Configuración por ambiente

## Archivos separados

| Ambiente | Archivo | Proyecto Docker | Imágenes | Almacenamiento por defecto |
|---|---|---|---|---|
| Desarrollo | `.env` | `terra` | `terra-web/api/worker` | `data/dev` |
| Producción | `.env.production` | `terra-prod` | `terra-prod-web/api/worker` | `/srv/terra-data/prod` |

Los scripts **no** mezclan archivos ni proyectos. No se debe copiar `.env` a producción.
Para producción:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

## Cómo se selecciona

```bash
./deploy/scripts/<script>.sh dev
./deploy/scripts/<script>.sh prod
```

Internamente:

```bash
docker compose --env-file <archivo> --project-name <proyecto> \
  -f deploy/compose.yaml -f deploy/compose.<ambiente>.yaml ...
```

Variables opcionales:

- `TERRA_ENV_FILE`: ruta alternativa (útil para pruebas aisladas).
- `TERRA_PROJECT`: nombre de proyecto Docker (debe ser único por ambiente).
- `WEB_PORT`, `DB_PORT`.

## Variables principales

### Aplicación

| Variable | Obligatoria | Descripción |
|---|---|---|
| `APP_ENV` | sí | `development` / `production` |
| `APP_PUBLIC_URL` | sí | URL pública; HTTPS en producción |
| `SESSION_SECRET` | sí | ≥32 caracteres |
| `SESSION_COOKIE_NAME` | no | `terra_session` |
| `SESSION_TTL_HOURS` | no | 12 |
| `TOKEN_ENCRYPTION_KEY` | sí | base64 de 32 bytes |

### PostgreSQL

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | sí | host interno `db` |
| `POSTGRES_DB` | sí | base |
| `POSTGRES_USER` | sí | usuario |
| `POSTGRES_PASSWORD` | sí | contraseña fuerte |
| `DB_PORT` | solo dev | puerto local, default 5432 |

### Google / Turnstile

| Variable | Obligatoria |
|---|---|
| `GOOGLE_CLIENT_ID` | sí |
| `GOOGLE_CLIENT_SECRET` | sí |
| `GOOGLE_REDIRECT_URL` | sí |
| `GOOGLE_DRIVE_REDIRECT_URL` | sí |
| `GOOGLE_DRIVE_SCOPES` | sí (`drive.readonly`) |
| `TURNSTILE_SITE_KEY` | sí |
| `TURNSTILE_SECRET_KEY` | sí |
| `TURNSTILE_HOSTNAME` | producción |
| `TURNSTILE_ACTION` | recomendado (`admin_login`) |
| `TURNSTILE_VERIFY_URL` | no |

### Almacenamiento

| Variable | Obligatoria | Descripción |
|---|---|---|
| `STORAGE_ROOT` | sí | `/var/lib/terra` (ruta interna) |
| `STORAGE_HOST_PATH` | dev | ruta host, relativa a `deploy/` o absoluta |
| `STORAGE_HOST_PATH_PROD` | prod | ruta host absoluta |
| `WEB_PORT` | no | 8080 |

### Worker, límites y bootstrap

Ver [configuration.md](configuration.md). Los valores de producción requieren aprobación
institucional; `.env.example` solo contiene ejemplos.

## Validaciones automáticas

`check.sh` comprueba:

- archivo correcto para el ambiente;
- variables obligatorias no vacías;
- ausencia de placeholders en secretos;
- `SESSION_SECRET` ≥ 32;
- `TOKEN_ENCRYPTION_KEY` = 32 bytes base64;
- `DATABASE_URL` apunta a `db`;
- `STORAGE_ROOT=/var/lib/terra`;
- scope `drive.readonly`;
- HTTPS y `APP_ENV=production` en producción;
- Turnstile y hostname en producción;
- permisos de `.env` (recomienda 600).

No imprime valores.

## Secretos

- `.env` y `.env.production` no se versionan.
- `.env.example` y `.env.production.example` solo tienen placeholders.
- `TOKEN_ENCRYPTION_KEY` se respalda por separado.
- Rotar credenciales compartidas en canales informales.
- Nunca usar prefijos `VITE_` para secretos; solo la site key pública se compila.

## Cambios de configuración

```bash
# 1. Editar el archivo del ambiente
# 2. Recrear contenedores afectados
./deploy/scripts/up.sh dev --build
# 3. Verificar
./deploy/scripts/status.sh dev
```

Para cambios de OAuth/Turnstile, reconstruir `web` es necesario porque la site key se compila:

```bash
./deploy/scripts/build.sh dev web
./deploy/scripts/up.sh dev
```

## Aislamiento

- Proyectos Docker distintos → volúmenes e imágenes distintos.
- Archivos `.env` distintos.
- Rutas de almacenamiento distintas.
- Nunca ejecute `down.sh prod` sobre desarrollo ni viceversa; el ambiente es obligatorio.
