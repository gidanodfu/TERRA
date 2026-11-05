# Copias de seguridad locales

Las copias de seguridad se guardan fuera del repositorio, en `BACKUP_HOST_PATH/<timestamp>/`.
Si la variable está vacía se usa `$XDG_DATA_HOME/terra/backups` o
`$HOME/.local/share/terra/backups`. Nunca se versionan.

## Creación

```bash
./terra backup
```

Contenido:

```
$BACKUP_HOST_PATH/<timestamp>/
├── terra.dump          # formato personalizado de PostgreSQL (o .gpg)
├── storage.tar.gz      # volumen de documentos (o .gpg)
├── metadata.json
└── SHA256SUMS
```

El script verifica checksums, la integridad del tar y la compatibilidad con pg_restore, y nunca
sobrescribe una copia de seguridad existente.

Cifrado opcional:

```bash
BACKUP_GPG_RECIPIENT=backup@example.test ./terra backup
```

## Verificación

```bash
./deploy/scripts/verify-backup.sh                 # copia más reciente
./deploy/scripts/verify-backup.sh <timestamp>
./deploy/scripts/verify-backup.sh /ruta/absoluta/del/backup
```

## Restauración

Última copia de seguridad:

```bash
./terra restore
```

Copia de seguridad específica:

```bash
./terra restore <timestamp>
./terra restore <timestamp> --db
./terra restore <timestamp> --storage
./terra restore /ruta/absoluta/del/backup
```

La búsqueda automática usa `BACKUP_HOST_PATH`; también se acepta una ruta absoluta.

El script:
1. valida metadatos y checksums;
2. comprueba el espacio disponible;
3. muestra los componentes que se reemplazarán;
4. solicita confirmación (`CONFIRM=yes` para modo no interactivo);
5. detiene web/api/worker;
6. restaura PostgreSQL y/o los documentos;
7. reinicia y verifica todos los servicios;
8. comprueba la consistencia entre base de datos y disco cuando restaura ambos.

La copia de seguridad se conserva después de la restauración. Una restauración solo es destructiva para los
componentes seleccionados.

## Migración desde `backups/`

Si existían copias dentro del repositorio:

```bash
./terra migrate-data           # simulación
./terra migrate-data --apply   # copia verificada y actualiza .env
```

Las copias antiguas se copian sin modificarlas y el origen se conserva hasta que se autorice
su eliminación manual.

## Clave de cifrado

`TOKEN_ENCRYPTION_KEY` **no** está dentro de la copia de seguridad. Guárdela por separado. Sin ella,
los refresh tokens no se pueden descifrar y los workers deben reconectar Drive.

## Recuperación probada

Durante el desarrollo, se creó una fila marcadora después de una copia de seguridad, se restauró la copia de seguridad,
y la marca desapareció mientras los usuarios y las migraciones originales permanecían. Esto
valida la ruta de restauración local.
