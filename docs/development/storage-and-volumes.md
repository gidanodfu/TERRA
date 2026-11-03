# Storage and volumes

## Local document path

`STORAGE_HOST_PATH` defaults to `../data/dev` relative to `deploy/`, resolving to
the repository `data/dev` directory. The container path is fixed at
`/var/lib/terra`.

```
data/dev/
├── staging/
└── areas/
    └── area-<uuid>--<slug>/
        └── cargos/
            └── cargo-<uuid>--<slug>/
                └── usuarios/
                    └── user-<uuid>/
                        └── drive-backups/
                            └── job-<uuid>/
                                └── Mi unidad/
```

Each job creates an independent snapshot. Documents are never stored in PostgreSQL.

## Permissions

The API and worker run with the host UID/GID (`TERRA_UID`/`TERRA_GID`), so local
files remain readable and editable by the developer. Compose mounts:

- API: `/var/lib/terra` read-only.
- Worker: `/var/lib/terra` read-write.

The API and worker cannot write outside the configured document root.

## PostgreSQL volume

`terra_terra-db` is a named Docker volume mounted at `/var/lib/postgresql`. It is
preserved by stop/down and by container removal.

## Node modules and Go caches

- Anonymous `/app/node_modules` volume: container-owned frontend dependencies.
- `.cache/go-mod` and `.cache/go-build`: host directories for Go module/build caches.

These are caches, not application data.

## Path safety

The storage module sanitizes each name, rejects `..`, absolute paths and symlinks,
keeps paths contained under `STORAGE_ROOT`, and writes via temporary `.part` files
plus atomic rename. Collisions receive a deterministic suffix based on the Drive ID.

## Consistency

```bash
./deploy/scripts/consistency-check.sh
```

Compares completed `stored_files` with the document path. The test suite does not
modify development documents.

## Capacity

Local limits are configured in `.env`:

- `MAX_DOWNLOAD_BYTES`
- `MAX_JOB_BYTES`
- `MAX_USER_STORAGE_BYTES`
- `MAX_AREA_STORAGE_BYTES`
- `MIN_FREE_DISK_BYTES`

## Cleanup

Unreferenced `.part` files are removed on retries. Snapshot retention is explicit:

```bash
./deploy/scripts/retention.sh          # dry run
CONFIRM=yes ./deploy/scripts/retention.sh --apply
```
