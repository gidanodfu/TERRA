# Tiempo real y progreso de descargas

## Fuente de verdad

PostgreSQL conserva el estado autoritativo. El worker mantiene en memoria los bytes
en vuelo, pero publica snapshots agregados con una frecuencia configurable
(`PROGRESS_INTERVAL_MS`, por defecto 400 ms) en `download_job_progress`.

Cada snapshot incluye:

- etapa y estado;
- bytes completados, en vuelo y transferidos;
- total conocido, elementos sin tamaño y porcentaje exacto o `null`;
- contadores de elementos;
- transferencias activas con porcentaje individual cuando se conoce el tamaño;
- velocidad instantánea, velocidad media, tiempo transcurrido y ETA calculable;
- métricas de escaneo.

`downloaded_bytes` en `download_jobs` sigue representando únicamente bytes de archivos
completados. El progreso parcial se expone en `transferred_bytes` y `in_flight_bytes`.

## Persistencia y distribución

1. El worker confirma bytes aceptados por el destino.
2. Cada intervalo hace UPSERT del snapshot con revisión incremental.
3. PostgreSQL emite `NOTIFY terra_progress`.
4. Los cambios de estado e hitos de elementos se guardan en `job_events` y emiten
   `NOTIFY terra_events`.
5. Cada instancia de API mantiene un conexión dedicada `LISTEN` y, al recibir una
   notificación, consulta el estado persistido.
6. La API distribuye el mensaje a los clientes suscritos al canal.

Las escrituras de progreso no crean filas en `job_events`.

## Canales y mensajes

Endpoint: `GET /api/v1/realtime` (WebSocket).

Cliente:

```json
{"type":"subscribe","channel":"job:<uuid>","last_event_id":123}
{"type":"unsubscribe","channel":"job:<uuid>"}
```

Canales:

- `job:{uuid}`: propietario/solicitante del trabajo o permiso `admin.jobs.read`.
- `admin.dashboard`: permiso `admin.dashboard.read`; el contenido de actividad reciente respeta
  el mismo alcance de auditoría que la API REST (completo para `admin`/`read_only`,
  operacional para `moderator`).

Mensajes de servidor:

- `connection.ready`
- `job.snapshot`
- `job.progress`
- `job.stage`
- `job.item.started`, `job.item.progress`, `job.item.completed`, `job.item.skipped`,
  `job.item.failed`, `job.item.retrying`
- `job.done`
- `dashboard.snapshot`, `dashboard.metrics`
- `realtime.error`

Todos incluyen `type`, `at` y `data`. Los snapshots incluyen `revision`; los eventos
durables incluyen `event_id`.

## Reconexión y recuperación

- El cliente mantiene una única conexión por sesión.
- Reconecta con backoff exponencial y jitter.
- Reenvía suscripciones con el último `event_id`.
- El servidor envía primero `job.snapshot` y después los eventos posteriores al cursor.
- Las revisiones antiguas se descartan en el cliente para evitar retrocesos.
- REST sigue disponible como carga inicial y respaldo.

## Límites

- Una conexión admite hasta 40 suscripciones.
- Los mensajes de cliente tienen un límite de 4 KB.
- La cola de salida es acotada; si se satura, la conexión se cierra y el cliente
  reconecta para recibir un snapshot nuevo.
- El canal no permite escrituras: cancelar y reintentar siguen siendo operaciones REST.
- El tamaño de un porcentaje global es exacto solo cuando no existen elementos con
  tamaño desconocido. En ese caso el porcentaje es `null` y la UI usa una barra
  indeterminada.
