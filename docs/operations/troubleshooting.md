# Troubleshooting

## Diagnóstico general

```bash
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml ps
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml logs -f api
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml logs -f worker
curl -i http://localhost:8080/api/v1/health
curl -i http://localhost:8080/api/v1/ready
```

Solo hay cuatro servicios. Si aparece `redis`, `minio`, `nginx` independiente o un segundo worker,
la configuración fue alterada y no corresponde a TERRA.

## La API no arranca

| Log | Causa | Acción |
|---|---|---|
| `configuration_error` | Falta variable o clave AES inválida | Revisar `.env`; `openssl rand -base64 32` |
| `storage directory missing or invalid` | API monta volumen ro y no existen `staging/`/`areas/` | Crear directorios en el host |
| `migration_failed` | Esquema incompatible o BD no disponible | Revisar logs de PostgreSQL; restaurar backup |
| `database_unavailable` | DSN/credenciales/red | Verificar `DATABASE_URL` y healthcheck de `db` |

## PostgreSQL no inicia

- PostgreSQL 18 requiere el volumen montado en `/var/lib/postgresql` (no en
  `/var/lib/postgresql/data`). El Compose ya lo hace así.
- Un volumen de una versión anterior no se migra automáticamente. Haga dump/restore.
- `pg_isready` falla si las credenciales del healthcheck no coinciden con `POSTGRES_USER/DB`.

## Worker no procesa

```bash
docker compose ... logs worker | grep -E "claim|job|heartbeat"
```

| Síntoma | Causa probable |
|---|---|
| `claim_failed: FOR UPDATE cannot be applied...` | Consulta de cola modificada sin `FOR UPDATE OF j` |
| Sin logs de jobs | No hay trabajos `queued` o no cumplen política/conexión |
| `waiting_authorization` | Refresh token inválido o política no aceptada; el trabajador debe reconectar |
| `job_lease_lost` | Heartbeat no pudo renovar; revisar conexión a BD y carga |
| Reintentos 429 | Cuota de Google; ajustar intervalo/concurrencia |

## Login Google

| Error | Causa |
|---|---|
| `redirect_uri_mismatch` | URL no registrada exactamente en Google Cloud |
| `oauth_state` | Cookie de state ausente/expirada o callback en otro navegador |
| `login_failed` | Intercambio de código fallido, correo no verificado o error de red |
| `account_mismatch` | La cuenta Drive autorizada no es la misma que la de la sesión |

No solicite “arreglarlo” desactivando la comprobación de `sub`: es un control de seguridad.

## Turnstile

| Error | Causa |
|---|---|
| `turnstile_not_configured` | Falta secret en la API |
| `turnstile_failed` | Token inválido/expirado/reutilizado |
| `no corresponde a esta operación` | `TURNSTILE_ACTION` no coincide |
| `no corresponde a este dominio` | `TURNSTILE_HOSTNAME` no coincide |
| Widget no aparece | `VITE_TURNSTILE_SITE_KEY` ausente en la compilación; CSP bloquea el script |

En producción no desactive la validación; corrija la configuración del widget.

## Volumen y permisos

| Síntoma | Acción |
|---|---|
| API: read-only file system | No debe crear directorios; verificar que existan y montar `:ro` |
| Worker: permission denied | `chown -R 10001:10001` en producción; en dev usar `TERRA_UID/TERRA_GID` |
| Archivo `.part` visible | El proceso se interrumpió; se limpia al reintentar. No es un documento final |
| `path escapes storage root` | Nombre/ID manipulado; investigar y revisar logs |

## SSE no actualiza

- Verifique que Nginx tenga `proxy_buffering off` y `X-Accel-Buffering: no`.
- Compruebe que el navegador no bloquee `text/event-stream`.
- El frontend hace fallback REST cada 5 s; si REST tampoco actualiza, revise PostgreSQL/worker.
- EventSource no permite headers personalizados; la autenticación es por cookie de mismo origen.

## Capacidad

| Código | Acción |
|---|---|
| `capacity_disk` | Liberar espacio o aumentar el volumen |
| `capacity_active_jobs` | Esperar o ajustar límite aprobado |
| `capacity_user_storage` / `capacity_area_storage` | Revisar retención/política |
| `size_limit_exceeded` | Archivo supera `MAX_DOWNLOAD_BYTES`; decisión institucional |

## Rate limit

`429 rate_limited` en login es esperado tras varios intentos. Espere la ventana o reinicie la API
solo en desarrollo (los límites viven en memoria). En producción, agregue límites de borde.

## Recuperación de un trabajo

1. Revisar el detalle y los elementos fallidos.
2. Corregir la causa (conexión, cuota, espacio).
3. `POST /download-jobs/{id}/retry-failed`.
4. Si el trabajo falló durante el escaneo, cree uno nuevo con nueva `Idempotency-Key`.
