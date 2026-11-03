# Instalación desde un equipo limpio

## 1. Instalar Docker

Instale Docker Engine y el plugin Compose v2 siguiendo la documentación oficial de su
distribución. Verifique:

```bash
docker version
docker compose version
```

## 2. Clonar el repositorio

```bash
git clone https://github.com/gidanodfu/TERRA.git
cd TERRA
```

No es necesario instalar Go, Node ni PostgreSQL.

## 3. Configurar el ambiente

### Desarrollo

```bash
cp .env.example .env
chmod 600 .env
```

Edite `.env` y complete:

- `APP_PUBLIC_URL`
- `DATABASE_URL`, `POSTGRES_PASSWORD`
- `SESSION_SECRET` → `openssl rand -hex 32`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, redirect URIs
- `TOKEN_ENCRYPTION_KEY` → `openssl rand -base64 32`
- claves Turnstile
- `STORAGE_HOST_PATH` (por defecto `../data/dev` relativo a `deploy/`)
- `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`
- límites aprobados

### Producción

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

El archivo de producción es independiente y **nunca** se mezcla con `.env`.
Los scripts usan:

| Ambiente | Archivo | Proyecto Docker |
|---|---|---|
| dev | `.env` | `terra` |
| prod | `.env.production` | `terra-prod` |

## 4. Preparar Google OAuth

1. Proyecto en Google Cloud con Google Drive API v3 habilitada.
2. Cliente OAuth **External**.
3. Redirect URIs exactas:

```text
http://localhost:8080/api/v1/auth/google/callback
http://localhost:8080/api/v1/auth/google/drive/callback
```

Para producción, HTTPS bajo el dominio institucional. No cambie a Internal: los trabajadores
usan cuentas personales. El scope documental es `drive.readonly` y requiere verificación de
Google para uso general.

## 5. Preparar Turnstile

Cree un widget para el hostname y configure `TURNSTILE_SITE_KEY`,
`TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME` y `TURNSTILE_ACTION`.

## 6. Preparar el almacenamiento

### Desarrollo

Los scripts crean `data/dev/{staging,areas}` y verifican permisos.

### Producción

Una sola vez, con privilegios suficientes:

```bash
sudo mkdir -p /srv/terra-data/prod/{staging,areas}
sudo chown -R 10001:10001 /srv/terra-data/prod
sudo chmod 750 /srv/terra-data/prod /srv/terra-data/prod/staging /srv/terra-data/prod/areas
```

## 7. Validar el entorno

```bash
./deploy/scripts/check.sh dev
```

Comprueba Docker, Compose, `.env`, variables obligatorias, ausencia de placeholders, archivos,
servicios exactos, almacenamiento, base de datos y espacio libre. No imprime secretos.

## 8. Construir imágenes

```bash
./deploy/scripts/build.sh dev
```

Opcional sin caché:

```bash
./deploy/scripts/build.sh dev --no-cache
```

## 9. Inicializar servicios

Desarrollo:

```bash
./deploy/scripts/init.sh dev
```

Producción (primera instalación autorizada):

```bash
./deploy/scripts/init.sh prod --allow-empty-db
# En automatización no interactiva:
# CONFIRM_PROD="INIT PROD" ./deploy/scripts/init.sh prod --allow-empty-db
```

El script crea el volumen, inicia PostgreSQL, aplica migraciones, ejecuta el bootstrap, arranca
worker/web y verifica todo.

## 10. Verificación final

```bash
./deploy/scripts/status.sh dev
curl -fsS http://127.0.0.1:8080/api/v1/health
curl -fsS http://127.0.0.1:8080/api/v1/ready
```

Abra `http://127.0.0.1:8080`, inicie sesión como administrador y cambie la contraseña inicial.

## Qué hace el instalador automáticamente

- Valida Docker, Compose y la configuración.
- Resuelve rutas desde cualquier directorio.
- Crea directorios técnicos de almacenamiento en desarrollo.
- Verifica el volumen PostgreSQL existente antes de inicializar.
- Construye imágenes faltantes.
- Inicia servicios en orden y espera healthchecks.
- Aplica migraciones y bootstrap idempotente.
- Verifica API, Nginx, base de datos, almacenamiento y worker.
- Nunca elimina volúmenes ni datos.

## Qué debe configurar manualmente el operador

- Credenciales OAuth y Turnstile.
- Redirect URIs en Google Cloud.
- Texto legal aprobado de la política.
- Límites de capacidad aprobados.
- Propiedad y ruta del volumen en producción.
- TLS/proxy institucional.
- Custodia separada de `TOKEN_ENCRYPTION_KEY`.

## Documentos relacionados

- [Primer arranque](first-start.md)
- [Configuración por ambiente](environment-configuration.md)
- [Referencia de scripts](scripts-reference.md)
- [Despliegue en producción](production-deployment.md)
