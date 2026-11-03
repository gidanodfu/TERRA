# Instalación

## Requisitos

- Docker Engine 29+ y Docker Compose v2/v5.
- 4 GB de RAM recomendados para el stack completo (ajustable).
- Espacio en disco para PostgreSQL y el volumen documental.
- Conectividad saliente HTTPS hacia Google y Cloudflare.
- Un hostname y TLS para producción.

No se requiere Go, Node ni PostgreSQL en el host.

## 1. Configuración

```bash
cp .env.example .env
chmod 600 .env
```

Complete como mínimo:

- `APP_PUBLIC_URL`
- `DATABASE_URL` y `POSTGRES_PASSWORD`
- `SESSION_SECRET` (`openssl rand -hex 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`, `GOOGLE_DRIVE_REDIRECT_URL`
- `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`)
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME`
- `STORAGE_HOST_PATH`
- `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_PASSWORD`
- límites de capacidad aprobados

## 2. Volumen documental

Desarrollo (el usuario del host debe poder escribir; el override de dev usa `TERRA_UID`/`TERRA_GID`):

```bash
mkdir -p data/dev/staging data/dev/areas
chmod 750 data/dev data/dev/staging data/dev/areas
```

Producción (UID/GID 10001 de la imagen):

```bash
sudo deploy/scripts/init-storage.sh /srv/terra-data/prod
```

## 3. Arranque

Desarrollo:

```bash
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml up -d --build
```

Producción:

```bash
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d --build
```

## 4. Bootstrap

Solo la primera vez (idempotente):

```bash
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml \
  exec -T api /app/bootstrap
```

El administrador se crea con `must_rotate_password=true`. Inicie sesión y cambie la contraseña.

## 5. Verificación

```bash
curl -fsS http://localhost:8080/api/v1/health
curl -fsS http://localhost:8080/api/v1/ready
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml ps
```

Los cuatro servicios deben estar `healthy`. Abra `http://localhost:8080`.

## 6. Google Cloud

1. Cree un cliente OAuth **External**.
2. Agregue los redirect URIs exactos (dev y prod).
3. Habilite Google Drive API v3.
4. Configure la pantalla de consentimiento con los scopes de login y `drive.readonly`.
5. Añada usuarios de prueba mientras la app no esté verificada.
6. No asuma aprobación de Google.

## 7. Turnstile

1. Cree un widget para el hostname real.
2. Configure site key, secret, hostname y action.
3. Verifique que el login rechaza un token inválido.
4. No use claves de prueba en producción.

## Desinstalación segura

```bash
docker compose ... down          # conserva volúmenes
```

No use `down -v` salvo que desee destruir la base de datos de desarrollo.
