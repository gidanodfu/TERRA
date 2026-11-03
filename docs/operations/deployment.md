# Despliegue en producción

## Prerrequisitos institucionales

- Hostname y certificado TLS.
- Cliente OAuth **External** con redirect URIs de producción.
- Verificación de Google del scope `drive.readonly` (o modo de prueba controlado).
- Widget Turnstile del dominio de producción.
- Texto de política institucional aprobado.
- Límites de capacidad aprobados.
- Procedimiento de respaldo y custodia de `TOKEN_ENCRYPTION_KEY`.

## Preparación

```bash
sudo mkdir -p /srv/terra-data/prod/{staging,areas}
sudo chown -R 10001:10001 /srv/terra-data/prod
sudo chmod 750 /srv/terra-data/prod /srv/terra-data/prod/staging /srv/terra-data/prod/areas

cp .env.example .env
chmod 600 .env
# Editar para producción:
#   APP_ENV=production
#   APP_PUBLIC_URL=https://terra.municipio.gob.mx
#   datos de Google y Turnstile de producción
#   límites aprobados
#   STORAGE_HOST_PATH_PROD=/srv/terra-data/prod
```

## Despliegue

```bash
docker compose --env-file .env \
  -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d --build

docker compose --env-file .env \
  -f deploy/compose.yaml -f deploy/compose.prod.yaml exec -T api /app/bootstrap
```

## TLS

La API no termina TLS. Opciones:

1. proxy institucional (recomendado) → `web:8080`;
2. terminación en el host con Nginx/Traefik;
3. no publicar el puerto web directamente a Internet.

Cabeceras HSTS y CSP deben configurarse en el proxy TLS. La configuración interna ya envía CSP,
`X-Frame-Options`, `nosniff` y `Referrer-Policy`.

## Verificación posterior

```bash
curl -fsS https://terra.municipio.gob.mx/api/v1/health
curl -fsS https://terra.municipio.gob.mx/api/v1/ready
docker compose ... ps
```

1. Iniciar sesión como administrador y rotar la contraseña.
2. Publicar la política institucional aprobada.
3. Crear áreas y cargos.
4. Probar login Google con una cuenta de prueba.
5. Conectar Drive, aceptar política y ejecutar un snapshot pequeño.
6. Verificar SSE, descarga de un documento y auditoría.
7. Ejecutar `consistency-check.sh`.
8. Ensayar backup y restauración en un entorno separado.

## Actualización

```bash
# 1. Backup coordinado
deploy/scripts/backup.sh

# 2. Nuevas imágenes y migraciones
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml build
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d
```

La API y el worker aplican migraciones con advisory lock. Aun así, para cambios destructivos:

1. detener worker;
2. backup;
3. aplicar migración;
4. verificar;
5. arrancar worker.

## Rollback

- Las migraciones no se revierten automáticamente. Mantenga backups previos.
- Las imágenes anteriores pueden reutilizarse si el esquema es compatible.
- Si se revierte una migración, hágalo con un script revisado y backup verificado.

## Google

No anuncie TERRA como verificada hasta recibir confirmación. Mientras tanto:

- mantenga el proyecto en modo de prueba;
- limite los usuarios de prueba;
- revise periódicamente el estado de verificación en Google Cloud Console.

## Rotación de secretos

- Contraseña de PostgreSQL: actualizar en PostgreSQL y `.env`, reiniciar API/worker.
- `SESSION_SECRET`: invalida sesiones existentes.
- `TOKEN_ENCRYPTION_KEY`: requiere re-cifrado previo de refresh tokens (ver
  `docs/security/token-management.md`).
- Credenciales OAuth/Turnstile: rotar en el proveedor y actualizar `.env`, luego recrear API/web.
