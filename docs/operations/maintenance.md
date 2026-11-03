# Mantenimiento

## Rutina recomendada

| Frecuencia | Tarea |
|---|---|
| Diaria | Revisar salud de servicios, backlog de cola, errores del worker, espacio libre |
| Semanal | Revisar reconexiones de Drive, fallos de descarga, intentos de login |
| Mensual | Aplicar parches de seguridad de imágenes base y dependencias |
| Mensual | Verificar backup y ejecutar prueba de restauración en entorno separado |
| Trimestral | Revisar límites de capacidad, retención y accesos administrativos |
| Anual | Revisar política, credenciales OAuth y estado de verificación de Google |

## Logs

Los servicios emiten logs estructurados (`slog`) con `service`, `request_id` y campos de trabajo.
No contienen tokens, cookies, contraseñas ni contenido documental.

```bash
docker compose ... logs --since 1h api
docker compose ... logs --since 1h worker | grep error
```

En producción configure rotación (el Compose prod limita a 20 MB × 5) o envíe a un colector.

## Métricas sugeridas

No se incluye Prometheus en el MVP (límite de cuatro contenedores). Consultas SQL útiles:

```sql
-- Trabajos por estado
SELECT status, count(*) FROM download_jobs GROUP BY status;

-- Antigüedad del más antiguo en cola
SELECT now() - min(created_at) FROM download_jobs WHERE status='queued';

-- Conexiones que requieren reconexión
SELECT count(*) FROM drive_connections WHERE status='reauthorization_required';

-- Espacio documental por área
SELECT a.name, pg_size_pretty(sum(sf.size_bytes))
FROM stored_files sf JOIN users u ON u.id=sf.drive_owner_user_id
JOIN areas a ON a.id=u.area_id GROUP BY a.name;

-- Reintentos y fallos recientes
SELECT status, count(*) FROM download_items
WHERE finished_at > now() - interval '24 hours' GROUP BY status;

-- Eventos de autenticación fallidos
SELECT action, count(*) FROM audit_events
WHERE action LIKE 'auth.%failed' AND created_at > now() - interval '24 hours'
GROUP BY action;
```

Complementar con métricas del host: disco, inodos, CPU, memoria, red.

## Workers y leases

- Un trabajo con lease vencida se recupera automáticamente.
- Si el worker se reinicia, no es necesario intervenir.
- Si un trabajo permanece `downloading` sin progreso:
  1. revisar logs/heartbeat;
  2. comprobar conexión y cuota de Google;
  3. reiniciar el worker;
  4. si es necesario, cancelar y reintentar.

## Base de datos

- `VACUUM (ANALYZE)` periódico o autovacuum por defecto.
- Monitorear crecimiento de `job_events` y `audit_events`.
- La retención de snapshots se ejecuta con `retention.sh` (dry-run por defecto).
- No borre filas de `stored_files`, `download_jobs` o `drive_nodes` manualmente sin coordinar con
  el volumen.

## Actualización de dependencias

- Go: actualizar `go.mod` y ejecutar `go test ./...` y `go vet ./...`.
- Frontend: `npm update` controlado, `npm run build`.
- Imágenes base: reconstruir y escanear vulnerabilidades.
- Revisar cambios de Google Drive API y de scopes antes de actualizar la integración.
- Registrar versiones en `docs/references/official-documentation.md`.

## Certificados y proxy

- Renovación automática del certificado TLS (ACME o PKI institucional).
- Mantener HSTS en el proxy TLS.
- Revisar CSP si se agregan nuevos orígenes (por ejemplo, un visor de documentos).

## Seguridad operativa

- Revisar usuarios administradores y roles.
- Rotar contraseñas iniciales y credenciales expuestas.
- Revisar conexiones `revoked`/`reauthorization_required`.
- Exportar auditoría a almacenamiento inmutable si se requiere no repudio fuerte.
- Mantener `TOKEN_ENCRYPTION_KEY` en custodia separada y probar su recuperación.

## Retención

```bash
deploy/scripts/retention.sh          # dry-run
APPLY=yes deploy/scripts/retention.sh
```

Requiere `RETENTION_DAYS > 0`. La eliminación borra archivos y filas del snapshot; no afecta a
otros trabajos.
