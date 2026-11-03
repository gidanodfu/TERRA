# Diseño de almacenamiento

## Estructura física

```
/var/lib/terra/                      # STORAGE_ROOT
├── staging/                         # directorio técnico
└── areas/
    └── area-<uuid>--<slug>/
        └── cargos/
            └── cargo-<uuid>--<slug>/
                └── usuarios/
                    └── user-<uuid>/
                        └── drive-backups/
                            └── job-<uuid>/
                                └── Mi unidad/
                                    ├── Informes/
                                    │   └── 2026/
                                    │       └── acta.docx
                                    └── Documentos/
```

- La identidad física son UUID, nunca nombres.
- `slug` es legible pero estable; no cambia al renombrar el área/cargo.
- Cada trabajo tiene un directorio `job-<uuid>` independiente: dos trabajos no comparten raíz.
- En PostgreSQL solo se guarda la ruta **relativa** a `STORAGE_ROOT`.

## Modos

- **Mi unidad completa**: el árbol empieza en `Mi unidad/` y se reproduce completo.
- **Carpetas seleccionadas**: se reconstruye la ruta original desde Mi unidad. Si se selecciona
  `Informes/2026`, el resultado es `Mi unidad/Informes/2026/...`, no `2026/...`.
- Carpetas vacías se crean.
- Raíces solapadas: se conserva únicamente la padre.

## Seguridad de rutas

1. El nombre de cada segmento se sanitiza: controles y `/\<>:"|?*` → `_`, sin puntos/espacios finales,
   nombres reservados de Windows con prefijo, máximo 120 bytes sin romper UTF-8, vacío → `_`.
2. La ruta relativa se valida: no vacía, no absoluta, sin `\`, sin NUL, sin segmentos `.` o `..`.
3. Se une a `STORAGE_ROOT` y se verifica contención con `filepath.Clean` + prefijo.
4. Al crear directorios se recorre cada componente con `Lstat` y se rechazan symlinks.
5. La lectura abre con `O_NOFOLLOW`, verifica archivo regular y resuelve symlinks dentro de la raíz.
6. El cliente nunca recibe la ruta absoluta ni la relativa interna.

## Colisiones

El nombre no identifica un archivo; el ID de Google sí. Si dos archivos comparten nombre en el
mismo directorio:

```
informe.pdf
informe.pdf~A1b2C3d4
```

El sufijo es determinista a partir del ID. El nombre original se conserva en `drive_nodes.name`.

## Escritura atómica

```
1. Crear .terra-<item>-*.part en el directorio destino
2. Stream desde Google (nunca en memoria)
3. Limitar tamaño (archivo, trabajo, capacidad)
4. SHA-256 (+ MD5 si Drive lo provee)
5. Comparar longitud/checksum
6. fsync + close
7. rename atómico al nombre final
8. INSERT stored_files + item completed (transacción)
```

Un `.part` nunca se presenta como documento completo. Al reiniciar se elimina o se descarta.
Dentro del mismo snapshot se permite reemplazar un archivo residual del mismo job; nunca se
sobrescribe el directorio de otro trabajo.

## Acceso

- Nginx no monta el volumen.
- `GET /api/v1/files/{id}/content` resuelve por ID interno, verifica propietario/solicitante o
  administrador, verifica que el job corresponda y transmite como `attachment`.
- Todo acceso administrativo se audita (`file.accessed`).
- Se envían cabeceras `nosniff`, `Content-Disposition` segura y `Cache-Control: private, no-store`.

## Capacidad

- `MAX_DOWNLOAD_BYTES`, `MAX_JOB_BYTES`, `MAX_USER_STORAGE_BYTES`, `MAX_AREA_STORAGE_BYTES`.
- `MIN_FREE_DISK_BYTES` se verifica con `statfs` antes de continuar.
- Los límites se configuran por entorno; los valores de producción requieren aprobación.
