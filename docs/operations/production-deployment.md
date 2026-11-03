# Despliegue en producción

## 1. Prerrequisitos institucionales

- Hostname y certificado TLS.
- Cliente OAuth **External** con redirect URIs HTTPS.
- Google Drive API v3 habilitada.
- Verificación de Google del scope `drive.readonly` (o modo de prueba controlado).
- Widget Turnstile del dominio.
- Política institucional aprobada.
- Límites de capacidad aprobados.
- Backups y custodia de `TOKEN_ENCRYPTION_KEY`.

## 2. Preparar el ambiente

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Complete valores reales. No copie `.env` de desarrollo. El proyecto Docker es `terra-prod` y las
imágenes son independientes.

Variables críticas:

```dotenv
APP_ENV=production
APP_PUBLIC_URL=https://terra.municipio.gob.mx
STORAGE_HOST_PATH_PROD=/srv/terra-data/prod
WEB_PORT=8080
```

## 3. Preparar el volumen

```bash
sudo mkdir -p /srv/terra-data/prod/{staging,areas}
sudo chown -R 10001:10001 /srv/terra-data/prod
sudo chmod 750 /srv/terra-data/prod /srv/terra-data/prod/staging /srv/terra-data/prod/areas
```

## 4. Validar

```bash
./deploy/scripts/check.sh prod
```

Falla si falta `.env.production`, si hay placeholders, si la URL no es HTTPS o si Turnstile no
está configurado.

## 5. Construir

```bash
./deploy/scripts/build.sh prod
```

Opcional sin caché:

```bash
./deploy/scripts/build.sh prod --no-cache
```

## 6. Primera inicialización

```bash
./deploy/scripts/init.sh prod --allow-empty-db
# No interactivo:
# CONFIRM_PROD="INIT PROD" ./deploy/scripts/init.sh prod --allow-empty-db
```

La creación de una base vacía en producción exige autorización explícita y confirmación
`INIT PROD`. Si detecta documentos o backups previos, aborta salvo autorización adicional.

## 7. Verificar

```bash
./deploy/scripts/status.sh prod
curl -fsS https://<host>/api/v1/health
curl -fsS https://<host>/api/v1/ready
```

Checklist posterior:

1. Login administrador y rotación de contraseña.
2. Publicar política institucional aprobada.
3. Crear áreas y cargos.
4. Login Google con cuenta de prueba.
5. Conectar Drive y aceptar política.
6. Descarga pequeña y verificación de documento.
7. Auditoría y SSE.
8. `consistency-check.sh prod`.
9. Backup y restauración de prueba en entorno separado.

## 8. TLS

La API no termina TLS. Opciones:

- proxy institucional → `web:8080` (recomendado);
- terminación en el host con Nginx/Traefik;
- no publicar el puerto web directamente a Internet sin TLS.

El proxy debe reenviar `X-Forwarded-Proto` y `X-Real-IP`. HSTS y límites de borde se configuran
en el proxy TLS.

## 9. Operación

```bash
./deploy/scripts/up.sh prod
./deploy/scripts/down.sh prod
./deploy/scripts/status.sh prod
./deploy/scripts/logs.sh prod api
./deploy/scripts/backup.sh prod
```

Nunca ejecutar scripts `dev` sobre `terra-prod`.

## 10. Actualización

```bash
./deploy/scripts/backup.sh prod
./deploy/scripts/build.sh prod
./deploy/scripts/up.sh prod
./deploy/scripts/migrate.sh prod status
./deploy/scripts/status.sh prod
```

Para migraciones delicadas:

1. detener worker;
2. backup;
3. `migrate.sh prod up`;
4. verificar;
5. arrancar worker.

## 11. Rollback

- Las migraciones no se revierten automáticamente.
- Mantenga la imagen anterior y un backup previo.
- Si es necesario, restaurar backup coordinado (BD + documentos + clave).
- No borrar volúmenes para “volver atrás”.

## 12. Backups

```bash
BACKUP_GPG_RECIPIENT=... ./deploy/scripts/backup.sh prod
./deploy/scripts/verify-backup.sh backups/prod/<timestamp>
```

Frecuencia, retención y cifrado deben ser aprobados. La clave de tokens se custodia aparte.

## 13. Google

No anuncie TERRA como verificada hasta recibir confirmación. Mientras tanto mantenga el proyecto
en modo de prueba y limite los usuarios autorizados.

## 14. Seguridad operativa

- PostgreSQL no se publica.
- API/worker solo en la red Docker.
- Contenedores no root y read-only.
- Secretos en `.env.production` con permisos 600 o gestor de secretos.
- Logs sin tokens ni contenido documental.
- Rotar credenciales compartidas.
- Monitorear disco, cola, reconexiones y errores de autenticación.
