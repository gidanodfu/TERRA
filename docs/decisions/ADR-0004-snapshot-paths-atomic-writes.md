# ADR-0004 — Layout de snapshots, rutas seguras y escritura atómica

Estado: aceptado.

## Contexto

Los documentos deben clasificarse por área, cargo, trabajador y snapshot, preservando además la
estructura original de Drive. Los nombres remotos son datos no confiables y pueden colisionar.

## Decisión

Ruta relativa:

```
areas/area-<uuid>--<slug>/cargos/cargo-<uuid>--<slug>/
usuarios/user-<uuid>/drive-backups/job-<uuid>/Mi unidad/<estructura original>
```

- Identidad física por UUID; slug legible y estable.
- La ruta relativa se guarda en PostgreSQL; la absoluta solo existe en el backend.
- Cada segmento de nombre se sanitiza y los caracteres peligrosos se reemplazan.
- Se rechazan `..`, rutas absolutas, separadores inválidos, NUL y symlinks.
- Colisiones: sufijo determinista `~<prefijo del ID>`.
- Escritura `.part` en el directorio destino, SHA-256, validación, `fsync` y `rename` atómico.
- API monta el volumen en solo lectura; el worker es el único escritor.

## Consecuencias

- No hay sobrescritura de snapshots de otros trabajos.
- Renombrar un área/cargo no rompe rutas existentes porque el slug no cambia.
- Los nombres no son identidad; los duplicados se conservan.
- El rename atómico exige que `.part` y destino estén en el mismo sistema de archivos.
- Los `.part` abandonados no se consideran documentos y se limpian al reintentar.
