# Troubleshooting

## Diagnóstico inicial

```bash
./deploy/scripts/check.sh dev
./deploy/scripts/status.sh dev
./deploy/scripts/logs.sh dev
```

Nunca borre volúmenes como primera solución. Los volúmenes contienen datos irremplazables.

## Docker no está iniciado

**Identificar:** `check.sh` muestra “daemon de Docker no accesible”.
**Solución:** iniciar Docker y verificar permisos del usuario.
**Verificar:** `docker info`.

## Docker Compose no instalado

**Identificar:** `docker compose version` falla.
**Solución:** instalar el plugin Compose v2.
**Verificar:** `docker compose version` ≥ 2.20.

## Falta `.env` o `.env.production`

**Identificar:** `check.sh` indica el archivo faltante.
**Solución:**

```bash
cp .env.example .env
# o
cp .env.production.example .env.production
```

**Verificar:** `./deploy/scripts/check.sh dev`.

## Variables inválidas o placeholders

**Identificar:** `check.sh` nombra la variable (nunca imprime el valor).
**Solución:** generar valores reales; no reutilizar ejemplos.
**Verificar:** `check.sh` sin errores.

## Error de construcción

**Identificar:** `build.sh` falla.
**Solución:**

```bash
./deploy/scripts/build.sh dev --no-cache
```

Revise red, espacio y logs de BuildKit. No afecta datos.
**Verificar:** imágenes listadas al final.

## Puerto ocupado

**Identificar:** `up.sh` falla al publicar 8080/5432.
**Solución:** detener el proceso que ocupa el puerto o definir `WEB_PORT` / `DB_PORT`.
**Verificar:** `status.sh` muestra el puerto y `curl /health`.

## PostgreSQL no inicia

**Identificar:** `db` unhealthy/exited.
**Logs:** `./deploy/scripts/logs.sh dev db`.
**Causas:** credenciales, volumen incompatible, permisos, espacio.
**Solución:** corregir configuración. No borrar el volumen. Si el volumen es de otra versión
mayor, restaurar desde dump.
**Verificar:** `db healthy` y `pg_isready`.

## PostgreSQL no está saludable

**Identificar:** timeout de healthcheck.
**Logs:** `logs.sh dev db`.
**Causas:** arranque lento, memoria, locks, corrupción.
**Solución:** esperar; revisar recursos; restaurar backup si hay corrupción.
**Verificar:** `migrate.sh dev version`.

## Error de migración

**Identificar:** API no healthy o `/app/migrate` falla.
**Logs:** `logs.sh dev api`.
**Causas:** migración incompatible, schema manual, migración ya aplicada modificada.
**Solución:** restaurar backup y corregir la migración en una nueva versión. No editar migraciones
ya aplicadas.
**Verificar:** `migrate.sh dev status` y API healthy.

## API no inicia

**Identificar:** `api` unhealthy.
**Logs:** `logs.sh dev api`.
**Causas:** configuración, clave AES inválida, storage ausente, migración, DB.
**Solución:** `check.sh`, corregir variable; no recrear la base.
**Verificar:** `/api/v1/ready`.

## Worker no inicia

**Identificar:** `worker` unhealthy.
**Logs:** `logs.sh dev worker`.
**Causas:** DB, storage no escribible, configuración, lease.
**Solución:** revisar permisos del volumen; verificar `DATABASE_URL`.
**Verificar:** `status.sh` y heartbeat.

## Nginx no sirve frontend

**Identificar:** `/` devuelve error o HTML inesperado.
**Logs:** `logs.sh dev web`.
**Causas:** imagen web antigua, Nginx mal configurado, build fallido.
**Solución:** `build.sh dev web` y `up.sh dev`.
**Verificar:** `curl -I http://127.0.0.1:8080/` y cabeceras CSP.

## Error de comunicación interna

**Identificar:** frontend 502 o API no responde.
**Logs:** `logs.sh dev web api`.
**Causas:** API caída, red Docker, puerto interno.
**Solución:** `status.sh`; recrear red/contenedores con `up.sh`.
**Verificar:** `/api/v1/health` a través de web.

## Volumen no encontrado

**Identificar:** `up.sh` indica volumen ausente; `status.sh` lo marca missing.
**Causa:** volumen eliminado o proyecto Docker distinto (dev/prod mezclados).
**Solución:** comprobar proyecto (`terra` vs `terra-prod`), revisar backups y restaurar. No crear
una base vacía en producción sin autorización.
**Verificar:** `init.sh` reutiliza el volumen y conserva usuarios.

## Permisos insuficientes en almacenamiento

**Identificar:** API/worker unhealthy; logs con `permission denied`.
**Solución producción:**

```bash
sudo chown -R 10001:10001 /srv/terra-data/prod
```

**Verificar:** `init.sh` o `status.sh`.

## Espacio insuficiente

**Identificar:** `check.sh` o logs de descarga.
**Solución:** liberar espacio, revisar retención aprobada, ampliar volumen.
**Verificar:** `df -h`, `status.sh`.

## Google OAuth inválido

**Identificar:** `redirect_uri_mismatch`, `oauth_state`, `login_failed`.
**Solución:** registrar redirect URIs exactas; usar el mismo navegador; revisar reloj; revisar
client ID/secret; no desactivar la validación de `state`/`sub`.
**Verificar:** login con cuenta de prueba.

## Refresh token revocado

**Identificar:** conexión `reauthorization_required`, trabajo `waiting_authorization`.
**Solución:** el trabajador debe reconectar Drive y aceptar la política vigente. El administrador
no puede hacerlo por él.
**Verificar:** `status.sh` y detalle del trabajo.

## Turnstile no válido

**Identificar:** `turnstile_failed`, `turnstile_unavailable`, hostname/action incorrectos.
**Solución:** revisar site key/secret, hostname, action y CSP. No desactivar la verificación.
**Verificar:** login administrativo.

## Contenedor eliminado accidentalmente

**Identificar:** `status.sh` muestra MISSING; volúmenes siguen existiendo.
**Solución:**

```bash
./deploy/scripts/init.sh dev
# o con reconstrucción:
./deploy/scripts/init.sh dev --rebuild
```

**Verificar:** cuatro healthy y datos previos conservados.

## Imágenes eliminadas

**Solución:**

```bash
./deploy/scripts/build.sh dev
./deploy/scripts/up.sh dev
```

Los datos no se ven afectados.

## Volúmenes eliminados

**Identificar:** `status.sh` no encuentra el volumen; `init.sh` detecta documentos/backups.
**Solución:** restaurar el último backup verificado:

```bash
CONFIRM=yes ./deploy/scripts/restore.sh dev <backup>
```

En producción se exige `CONFIRM_PROD="RESTORE PROD"`. No inicializar vacío sin autorización.
**Verificar:** `consistency-check.sh` y login con datos previos.

## Restauración desde backup

Ver [backup-restore.md](backup-restore.md). Nunca ejecutar `docker compose down -v`.
