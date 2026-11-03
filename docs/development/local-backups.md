# Local backups

Backups are local development artifacts under `backups/<timestamp>/`. They are
ignored by Git.

## Create

```bash
./terra backup
```

Contents:

```
backups/<timestamp>/
├── terra.dump          # PostgreSQL custom format (or .gpg)
├── storage.tar.gz      # document volume (or .gpg)
├── metadata.json
└── SHA256SUMS
```

The script verifies checksums, tar integrity and pg_restore compatibility, and never
overwrites an existing backup.

Optional encryption:

```bash
BACKUP_GPG_RECIPIENT=backup@example.test ./terra backup
```

## Verify

```bash
./deploy/scripts/verify-backup.sh backups/<timestamp>
```

## Restore

Latest backup:

```bash
./terra restore
```

Specific backup:

```bash
./terra restore backups/<timestamp>
./terra restore backups/<timestamp> --db
./terra restore backups/<timestamp> --storage
```

The script:
1. validates metadata and checksums;
2. checks available space;
3. shows the components to replace;
4. asks for confirmation (`CONFIRM=yes` for non-interactive);
5. stops web/api/worker;
6. restores PostgreSQL and/or documents;
7. restarts and verifies all services;
8. checks database/disk consistency when restoring both.

The backup is kept after restoration. A restore is destructive only for the selected
components.

## Encryption key

`TOKEN_ENCRYPTION_KEY` is **not** inside the backup. Store it separately. Without it,
refresh tokens cannot be decrypted and workers must reconnect Drive.

## Tested recovery

During development, a marker row was created after a backup, the backup was restored,
and the marker disappeared while the original users and migrations remained. This
validates the local restore path.
