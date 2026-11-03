# Backup y restauración

La recuperación de TERRA requiere **tres componentes coordinados**:

1. PostgreSQL.
2. Volumen documental.
3. `TOKEN_ENCRYPTION_KEY`, custodiada por un procedimiento independiente.

Respaldar solo PostgreSQL o solo los archivos produce un sistema inconsistente.

## Qué incluye el backup

`deploy/scripts/backup.sh` genera:

```
backups/<timestamp>/
├── terra.dump          # pg_dump formato custom
├── storage.tar.gz      # volumen documental completo
└── SHA256SUMS
```

Si `BACKUP_GPG_RECIPIENT` está definido, cifra ambos archivos con GPG y borra los planos.

**No incluye** `.env`, `TOKEN_ENCRYPTION_KEY`, credenciales OAuth ni claves Turnstile. Deben
resguardarse en un gestor de secretos separado.

## Frecuencia y retención

La institución debe aprobar la frecuencia. Como punto de partida razonable (no normativo):

- backup diario automatizado;
- retención de 30 días en caliente;
- copia mensual fuera del host;
- prueba de restauración trimestral;
- cifrado en reposo y en tránsito.

Ajuste según volumen, criticidad y política municipal.

## Crear backup

```bash
deploy/scripts/backup.sh
```

Programar con cron/systemd timer del usuario de despliegue. Verificar espacio antes.

## Verificar sin restaurar

```bash
deploy/scripts/verify-backup.sh backups/20261103T170000
```

Comprueba checksums, `pg_restore --list` y `tar tzf`.

## Restauración completa (procedimiento)

> Destructivo. Ejecutar en ventana de mantenimiento y con backup del estado actual.

1. Detener web, API y worker:
   ```bash
   docker compose --env-file .env -f deploy/compose.yaml stop web api worker
   ```
2. Restaurar PostgreSQL:
   ```bash
   CONFIRM=yes deploy/scripts/restore-db.sh backups/<ts>/terra.dump
   ```
3. Restaurar volumen:
   ```bash
   CONFIRM=yes deploy/scripts/restore-storage.sh backups/<ts>/storage.tar.gz
   ```
4. Verificar que `TOKEN_ENCRYPTION_KEY` corresponde al backup. Si no, los refresh tokens no se
   podrán descifrar; los trabajadores deberán reconectar su Drive.
5. Arrancar y comprobar:
   ```bash
   docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.prod.yaml up -d
   deploy/scripts/consistency-check.sh
   curl -fsS https://<host>/api/v1/ready
   ```
6. Iniciar sesión, verificar un documento y un trabajo. Revisar `audit_events`.
7. Confirmar que las sesiones antiguas no son válidas si cambió `SESSION_SECRET`.

## Restauración puntual de un documento

1. Localice `stored_files.relative_path` en PostgreSQL.
2. Extraiga solo ese archivo del `storage.tar.gz`.
3. Colóquelo en `STORAGE_ROOT/<relative_path>` con propietario `10001:10001` y permisos `640`.
4. Ejecute `consistency-check.sh`.

No inserte filas manualmente sin el archivo correspondiente.

## Consistencia

```bash
deploy/scripts/consistency-check.sh
```

Compara cada fila `stored_files(status=completed)` con el archivo en disco. Devuelve código 1 si
falta alguno.

## Escenarios

| Escenario | Acción |
|---|---|
| Pérdida de PostgreSQL | Restaurar dump + verificar volumen |
| Pérdida del volumen | Restaurar archivos + verificar BD |
| Pérdida de ambos | Restaurar ambos del mismo timestamp |
| Pérdida solo de la clave | Refresh tokens inválidos → reconexión de todos los trabajadores |
| Corrupción parcial | Restaurar snapshot puntual + auditoría |

## Seguridad del backup

- Cifrar con GPG/clave institucional.
- Almacenar fuera del host de producción.
- Restringir acceso y registrar quién restaura.
- Nunca incluir `.env` en el mismo archivo sin cifrar.
- Probar la restauración antes de necesitarla.
