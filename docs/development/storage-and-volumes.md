# Almacenamiento y volúmenes

## Ruta local de documentos

`STORAGE_HOST_PATH` toma por defecto `../data/dev` relativo a `deploy/`, lo que resuelve al
directorio `data/dev` del repositorio. La ruta del contenedor es fija:
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

Cada job crea una instantánea independiente. Los documentos nunca se almacenan en PostgreSQL.

## Permisos

La API y el worker se ejecutan con el UID/GID del host (`TERRA_UID`/`TERRA_GID`), de modo que los archivos locales
siguen siendo legibles y editables por el desarrollador. Compose monta:

- API: `/var/lib/terra` en solo lectura.
- Worker: `/var/lib/terra` en lectura y escritura.

La API y el worker no pueden escribir fuera de la raíz de documentos configurada.

## Volumen de PostgreSQL

`terra_terra-db` es un volumen Docker con nombre montado en `/var/lib/postgresql`. Se
conserva con stop/down y con la eliminación de contenedores.

## Node modules y cachés de Go

- `node_modules`: instalado en la imagen web; no se monta desde el host.
- `.cache/go-mod` y `.cache/go-build`: directorios del host para las cachés de módulos/build de Go.

Son cachés, no datos de la aplicación.

## Seguridad de rutas

El módulo de almacenamiento sanea cada nombre, rechaza `..`, rutas absolutas y symlinks,
mantiene las rutas contenidas bajo `STORAGE_ROOT`, y escribe mediante archivos temporales `.part`
más un rename atómico. Las colisiones reciben un sufijo determinista basado en el ID de Drive.

## Consistencia

```bash
./deploy/scripts/consistency-check.sh
```

Compara los `stored_files` completados con la ruta de documentos. La suite de pruebas no
modifica los documentos de desarrollo.

## Capacidad

Los límites locales se configuran en `.env`:

- `MAX_DOWNLOAD_BYTES`
- `MAX_JOB_BYTES`
- `MAX_USER_STORAGE_BYTES`
- `MAX_AREA_STORAGE_BYTES`
- `MIN_FREE_DISK_BYTES`

## Limpieza

Los archivos `.part` no referenciados se eliminan en los reintentos. La retención de instantáneas es explícita:

```bash
./deploy/scripts/retention.sh          # simulación, sin aplicar cambios
CONFIRM=yes ./deploy/scripts/retention.sh --apply
```
