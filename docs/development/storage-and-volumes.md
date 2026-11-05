# Almacenamiento y volúmenes

## Ruta externa de documentos

`STORAGE_HOST_PATH` es una ruta absoluta fuera del repositorio. Si queda vacía se resuelve:

```text
$XDG_DATA_HOME/terra/storage
# o, sin XDG_DATA_HOME:
$HOME/.local/share/terra/storage
```

`./terra init` y `./terra up` la crean automáticamente y la exportan a Compose. Si el valor
queda vacío en `.env`, los scripts resuelven el predeterminado en cada ejecución; por eso
los comandos de Compose deben lanzarse mediante `./terra`. La ruta interna de los contenedores
es fija: `/var/lib/terra` (`STORAGE_ROOT`).

```
$STORAGE_HOST_PATH/
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

La API y el worker se ejecutan con el UID/GID del host (`TERRA_UID`/`TERRA_GID`). Los scripts
crean la raíz documental y sus subdirectorios con `0750`; los backups con `0700` y archivos
`0600` (`umask 077`).

Compose monta:

- API: `STORAGE_HOST_PATH` en `/var/lib/terra` en solo lectura.
- Worker: `STORAGE_HOST_PATH` en `/var/lib/terra` en lectura y escritura.
- Web: nunca accede al almacenamiento.
- Backups: no se montan en ningún contenedor.

Si el sistema de archivos no permite estos permisos, la inicialización falla con un mensaje
explícito.

## Rutas externas y validación

`STORAGE_HOST_PATH` y `BACKUP_HOST_PATH`:

- deben ser absolutas;
- no pueden estar dentro del repositorio ni ser un symlink que resuelva dentro;
- no pueden ser `/`, el HOME completo, ni estar anidadas entre sí;
- no pueden compartir la misma raíz.

Valores como `../data/dev`, `./storage` o `backups` se rechazan. Para mover datos existentes:

```bash
./terra migrate-data           # simulación con archivos, tamaño y espacio
./terra migrate-data --apply   # copia, verifica SHA-256 y actualiza .env
```

La migración copia y verifica; nunca borra el origen.

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
