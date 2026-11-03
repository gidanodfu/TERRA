# ADR-0005 — Atajos de Google Drive como referencias

Estado: aceptado.

## Contexto

Los atajos (`application/vnd.google-apps.shortcut`) apuntan a archivos o carpetas. Recorrerlos
ingenuamente puede duplicar contenido, generar ciclos o descargar dos veces el mismo elemento.

## Decisión

1. Todo atajo se registra en `drive_nodes` con `is_shortcut` y `shortcut_target_id`.
2. Se resuelven sus metadatos básicos si están disponibles en `files.list`/`files.get`.
3. Se registra un `download_item` en estado `skipped` con código `shortcut_reference`.
4. **No se recorre** la carpeta destino ni se descarga una segunda copia de su contenido.
5. Las carpetas raíz seleccionadas no pueden ser atajos.

## Consecuencias

- Se evitan ciclos y duplicados de forma determinista.
- El atajo queda auditable y visible con su identidad remota.
- Si en el futuro se requiere materializar el contenido del atajo, debe añadirse una política
  explícita de deduplicación global por `google_file_id` y una decisión de producto.
- El administrador ve el atajo omitido con una razón comprensible, no como un fallo.
