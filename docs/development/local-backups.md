# Copias de seguridad locales

Las copias de seguridad son artefactos locales de desarrollo bajo `backups/<timestamp>/`. Git los
ignora.

## Creación

```bash
./terra backup
```

Contenido:

```
backups/<timestamp>/
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
./deploy/scripts/verify-backup.sh backups/<timestamp>
```

## Restauración

Última copia de seguridad:

```bash
./terra restore
```

Copia de seguridad específica:

```bash
./terra restore backups/<timestamp>
./terra restore backups/<timestamp> --db
./terra restore backups/<timestamp> --storage
```

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

## Clave de cifrado

`TOKEN_ENCRYPTION_KEY` **no** está dentro de la copia de seguridad. Guárdela por separado. Sin ella,
los refresh tokens no se pueden descifrar y los workers deben reconectar Drive.

## Recuperación probada

Durante el desarrollo, se creó una fila marcadora después de una copia de seguridad, se restauró la copia de seguridad,
y la marca desapareció mientras los usuarios y las migraciones originales permanecían. Esto
valida la ruta de restauración local.
