# Consulta de documentos y descargas

## Alcances de una descarga

| Alcance | Contenido |
|---|---|
| `my_drive_full` | Toda la raíz de Mi unidad, conservando carpetas vacías y excluyendo la papelera. |
| `selected_folders` | Una o más carpetas completas. |
| `selected_items` | Carpetas y archivos individuales combinados. |

Reglas del backend:

- La selección no puede estar vacía.
- Máximo 100 carpetas y 100 archivos por solicitud.
- Los identificadores de Drive deben tener contenido y no superar 256 caracteres.
- Un mismo elemento no puede enviarse como carpeta y archivo.
- Un elemento debe pertenecer al árbol de Mi unidad de la conexión autorizada.
- Las selecciones solapadas se normalizan: una carpeta cubre los archivos que
  contiene y las carpetas descendientes se descartan.
- Los atajos, la papelera, Google Vids y los archivos no descargables se
  rechazan con un mensaje funcional.

## Flujo de una descarga

1. El administrador elige el trabajador propietario.
2. El backend comprueba que el trabajador esté activo, tenga área y cargo,
   conexión vigente y política aceptada.
3. Se validan los límites de trabajos activos, almacenamiento y espacio libre.
4. Se crea el trabajo en estado `queued` y se registra la idempotencia.
5. El worker reclama el trabajo con `FOR UPDATE SKIP LOCKED`.
6. Se recorren las carpetas, se descargan los binarios y se exportan los
   documentos nativos de Google.
7. Cada archivo se escribe de forma atómica en su snapshot.
8. El progreso se consulta por REST o por el canal WebSocket `/api/v1/realtime`.

El navegador puede cerrarse: el worker continúa en el servidor.

## Estados habituales

`queued`, `scanning`, `downloading`, `waiting_authorization`,
`cancel_requested`, `completed`, `partially_completed`, `failed` y `cancelled`.
Los estados terminales no vuelven a procesarse.

## Documentos almacenados

- Los archivos se consultan desde el detalle del trabajo que los produjo.
- Cada elemento completado muestra **Descargar** cuando existe un archivo
  asociado y la cuenta está autorizada.
- La descarga usa `/api/v1/files/{id}/content` con el identificador interno de
  `stored_files`, nunca el identificador de Drive ni una ruta física.
- El backend comprueba la propiedad del trabajo o el permiso `admin.files.read`,
  y registra el acceso exitoso en auditoría.
- Si el archivo físico no está disponible, la interfaz muestra el mensaje del
  servidor y el intento fallido queda auditado.
- Los binarios se conservan byte a byte.
- Los documentos nativos de Google se exportan a formatos abiertos u ofimáticos.
  Google Forms se serializa como JSON. Consulte
  [Formatos de archivo](../development/file-formats.md).

No existen módulos independientes de **Mis documentos** ni **Almacenamiento**.
`stored_files` sigue siendo la tabla interna de registro de archivos.

## Retención

`RETENTION_DAYS` se lee por `deploy/scripts/retention.sh`, que por defecto
ejecuta una simulación y solo elimina snapshots con `--apply`. El backend no
aplica retención automática. Un valor `0` desactiva la retención.

```bash
./deploy/scripts/retention.sh
./deploy/scripts/retention.sh --apply
```

Revise siempre la simulación y las copias de seguridad antes de aplicar.
