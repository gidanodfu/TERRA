# Formatos y exportaciones

La clasificación y presentación de archivos está centralizada en
`frontend/src/features/drive/fileTypes.js` y `FileTypeIcon.jsx`. El MIME type de
Google Drive tiene prioridad; la extensión solo se usa como respaldo. Un tipo
desconocido conserva un icono genérico y sigue siendo seleccionable si el backend
confirma que puede descargarse.

## Archivos binarios

Se descargan con `files.get` conservando bytes, nombre y extensión originales. No
se convierten, recomprimen ni reinterpretan. Se admiten, entre otros:

- Documentos: PDF, DOC/DOCX, TXT, ODT, RTF, EPUB, HTML, Markdown.
- Hojas: XLS/XLSX, CSV, ODS, TSV.
- Presentaciones: PPT/PPTX, ODP.
- Imágenes: PNG, JPG/JPEG, GIF, SVG, WEBP, DNG, TIFF, BMP.
- Vídeo: MP4, MOV, AVI, MKV, WEBM.
- Audio: MP3, WAV, OGG, FLAC, AAC.
- Comprimidos: ZIP, RAR, 7Z, TAR, GZ, BZ2, XZ.
- Código: JS/TS/JSX/TSX, GO, PY, PHP, HTML, CSS, JSON, XML, SQL, YAML, SH.

DNG y otros RAW se guardan exactamente como los entrega Google Drive. Si el MIME
llega genérico, la extensión se usa solo para la presentación, nunca para cambiar
el archivo.

## Documentos nativos de Google

| Tipo | Predeterminado | Alternativas |
|---|---|---|
| Docs | DOCX | PDF, ODT, RTF, TXT, HTML, ZIP, EPUB, Markdown |
| Sheets | XLSX | PDF, ODS, CSV*, TSV*, ZIP |
| Slides | PPTX | PDF, ODP, TXT |
| Drawings | PDF | PNG, JPEG, SVG |
| Apps Script | JSON | — |
| Forms | `Nombre.form.json` | — |
| Vids | No soportado | — |

\* CSV y TSV exportan únicamente la primera hoja, según la limitación documentada
de Google.

## Google Forms

La exportación usa `forms.get` de la Google Forms API y serializa la definición del
formulario (preguntas, secciones y configuración disponible). No incluye respuestas
de participantes: obtenerlas requiere alcances adicionales y una política de
privacidad específica, fuera de este alcance.

## Google Vids

Google Vids no se exporta con `files.export`. Requiere un flujo asíncrono de
`files.download` con seguimiento de operación, reanudación y checksums. Hasta
integrarlo correctamente, el elemento se registra como omitido con la razón
`google_vids_out_of_scope`; nunca se genera un archivo incorrecto.

## Nombres y límites

- La extensión de salida la determina el MIME de exportación.
- No se duplican extensiones.
- Los duplicados usan `storage.UniqueName()`.
- Se mantienen `canDownload`, límites de tamaño, MD5/SHA-256, escritura atómica,
  idempotencia y cancelación.
