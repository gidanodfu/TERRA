# Mantenimiento

## Rutina recomendada

| Frecuencia | Tarea |
|---|---|
| Diaria | `status.sh`, revisar cola, errores del worker y espacio |
| Semanal | Revisar reconexiones de Drive, fallos y autenticaciones |
| Mensual | `build.sh --no-cache` para parches de base; verificar backup |
| Mensual | Prueba de restauración en entorno separado |
| Trimestral | Revisar límites, retención y accesos administrativos |
| Anual | Revisar política, credenciales OAuth y verificación de Google |

## Diagnóstico diario

```bash
./deploy/scripts/status.sh dev
./deploy/scripts/logs.sh dev worker | grep -i error
./deploy/scripts/test.sh dev integration
```

## Actualización de imágenes

```bash
./deploy/scripts/backup.sh dev
./deploy/scripts/build.sh dev --no-cache
./deploy/scripts/up.sh dev
./deploy/scripts/status.sh dev
```

BuildKit y multi-stage están integrados. La construcción no toca datos.

## Base de datos

- Autovacuum de PostgreSQL por defecto.
- Monitorear `job_events` y `audit_events`.
- Migraciones: `migrate.sh dev status`.
- No borrar filas de historial sin coordinar con el volumen.
- Retención de snapshots solo con `retention.sh` (dry-run por defecto).

## Logs

```bash
./deploy/scripts/logs.sh dev
./deploy/scripts/logs.sh dev api -n 500
./deploy/scripts/logs.sh dev worker -f
```

En producción el Compose limita logs a 20 MB × 5. Para retención mayor, enviar a un colector.
Nunca se registran tokens, cookies, contraseñas ni contenido documental.

## Métricas

El MVP mantiene cuatro contenedores; no incorpora Prometheus. Use SQL y métricas del host:

```sql
SELECT status, count(*) FROM download_jobs GROUP BY status;
SELECT now() - min(created_at) FROM download_jobs WHERE status='queued';
SELECT count(*) FROM drive_connections WHERE status='reauthorization_required';
SELECT status, count(*) FROM download_items
WHERE finished_at > now() - interval '24 hours' GROUP BY status;
```

Complementar con disco, inodos, CPU, memoria, latencia y errores de Google.

## Workers y leases

- Un lease vencido se recupera automáticamente.
- Si un trabajo permanece `downloading` sin progreso: revisar logs, cuota de Google, conexión y
  reiniciar el worker:

```bash
./deploy/scripts/restart.sh dev worker
```

## Backup y restauración

```bash
./deploy/scripts/backup.sh dev
./deploy/scripts/verify-backup.sh backups/dev/<timestamp>
./deploy/scripts/consistency-check.sh dev
```

La restauración destructiva exige confirmación. Ver [backup-restore.md](backup-restore.md).

## Certificados

Renovación automática en el proxy TLS institucional. Mantener HSTS y revisar CSP al añadir
nuevos orígenes.

## Seguridad operativa

- Revisar administradores y roles.
- Rotar credenciales expuestas.
- Custodiar `TOKEN_ENCRYPTION_KEY` por separado.
- Exportar auditoría a almacenamiento inmutable si se requiere no repudio.
- Escanear imágenes y dependencias.
- No eliminar volúmenes para resolver incidencias.

## Retención

```bash
./deploy/scripts/retention.sh dev          # dry-run
CONFIRM=yes ./deploy/scripts/retention.sh dev --apply
```
