# Backup y restauración

La recuperación completa requiere **tres componentes coordinados**:

1. PostgreSQL.
2. Volumen documental.
3. `TOKEN_ENCRYPTION_KEY`, custodiada por un procedimiento independiente.

## Contenido del backup

```text
backups/<ambiente>/<timestamp>/
├── terra.dump          # o terra.dump.gpg
├── storage.tar.gz      # o storage.tar.gz.gpg
├── metadata.json       # ambiente, proyecto, commit, fecha, ruta, cifrado
└── SHA256SUMS
```

No incluye `.env` ni `TOKEN_ENCRYPTION_KEY`.

## Crear backup

```bash
./deploy/scripts/backup.sh dev
```

Con cifrado GPG:

```bash
BACKUP_GPG_RECIPIENT=backup@municipio.gob.mx ./deploy/scripts/backup.sh dev
```

El script:

- exige PostgreSQL activo y almacenamiento accesible;
- crea un directorio nuevo con permisos 700;
- ejecuta `pg_dump -Fc` dentro del contenedor `db`;
- archiva el volumen documental;
- escribe metadatos y checksums;
- verifica checksums, tar y dump con `pg_restore --list`;
- **nunca sobrescribe** un backup existente.

## Verificar

```bash
./deploy/scripts/verify-backup.sh backups/dev/<timestamp>
```

Comprueba checksums, integridad del tar y estructura del dump. Para backups cifrados se necesita
la clave GPG.

## Frecuencia y retención

La institución debe aprobar la política. Punto de partida recomendado (no normativo):

- backup diario;
- 30 días en caliente;
- copia mensual fuera del host;
- prueba de restauración trimestral;
- cifrado en reposo y en tránsito.

## Restaurar

### Desarrollo

```bash
CONFIRM=yes ./deploy/scripts/restore.sh dev backups/dev/<timestamp>
```

Solo PostgreSQL:

```bash
CONFIRM=yes ./deploy/scripts/restore.sh dev backups/dev/<timestamp> --db
```

Solo almacenamiento:

```bash
CONFIRM=yes ./deploy/scripts/restore.sh dev backups/dev/<timestamp> --storage
```

### Producción

Requiere doble confirmación:

```bash
CONFIRM=yes CONFIRM_PROD="RESTORE PROD" \
  ./deploy/scripts/restore.sh prod backups/prod/<timestamp>
```

En terminal interactiva se solicita escribir `RESTORE PROD`.

### Qué hace

1. Verifica ambiente del `metadata.json`.
2. Verifica checksums.
3. Comprueba el espacio y los archivos requeridos.
4. Muestra qué se sustituirá.
5. Detiene web, api y worker.
6. Restaura PostgreSQL con `pg_restore --clean --if-exists --no-owner`.
7. Restaura el volumen documental (si corresponde).
8. Reinicia servicios y espera healthchecks.
9. Comprueba consistencia entre `stored_files` y el disco.
10. Conserva el backup.

### Qué no hace

- No restaura `TOKEN_ENCRYPTION_KEY`.
- No elimina el backup.
- No restaura componentes no seleccionados.
- No continúa si falla una verificación.

## Clave de cifrado

Si la clave actual no corresponde a la del backup, los refresh tokens no se descifran y los
trabajadores deben reconectar Google Drive. Los documentos y metadatos siguen siendo válidos.

Respaldar la clave:

- en un gestor de secretos institucional;
- separada de PostgreSQL y del volumen;
- con procedimiento de recuperación y doble custodia;
- nunca en el mismo tar del backup.

## Escenarios

| Escenario | Acción |
|---|---|
| Pérdida de PostgreSQL | Restaurar dump; los documentos permanecen |
| Pérdida del volumen | Restaurar storage; la BD permanece |
| Pérdida de ambos | Restaurar dump + storage del mismo timestamp |
| Contenedores eliminados, volúmenes intactos | `init.sh` o `up.sh`; no restaurar |
| Volumen PostgreSQL eliminado | Restaurar desde backup; no crear base vacía en prod |
| Clave perdida | Reconexión de todos los trabajadores |
| Corrupción parcial | Restaurar snapshot completo + auditoría |

## Prueba de restauración

Antes de producción:

1. crear un backup;
2. insertar un registro marcador en desarrollo;
3. restaurar el backup;
4. verificar que el marcador desaparece y los datos originales permanecen;
5. ejecutar `consistency-check.sh`;
6. comprobar login y descarga de un documento.

Esta prueba se ejecutó en desarrollo durante la entrega.

## Nunca

- `docker compose down -v`
- `docker volume rm`
- `docker system prune --volumes`
- borrar PostgreSQL para "reiniciar"
- restaurar sin verificar checksums
- restaurar producción sin backup y confirmación
