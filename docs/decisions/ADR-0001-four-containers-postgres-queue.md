# ADR-0001 — Cuatro contenedores y cola en PostgreSQL

Estado: aceptado.

## Contexto

La especificación exige exactamente cuatro contenedores de ejecución y prohíbe Redis, RabbitMQ u
otros brokers. Las descargas deben ser asíncronas, persistentes, recuperables e idempotentes.

## Decisión

Usar `web`, `api`, `worker`, `db`, con PostgreSQL como cola persistente:

- `download_jobs` y `download_items` guardan estado;
- el reclamo usa `SELECT ... FOR UPDATE OF j SKIP LOCKED`;
- un lease con `lease_expires_at` y `heartbeat_at` permite recuperar trabajos abandonados;
- la idempotencia se implementa con una restricción única.

Las migraciones se aplican desde la API y el worker con advisory lock; no se crea un contenedor de
migraciones ni un quinto servicio.

## Consecuencias

- Menos infraestructura y una sola fuente de verdad.
- El worker debe implementar heartbeat/lease correctamente.
- La cola compite con las lecturas normales; los índices de estado/lease son obligatorios.
- No hay fan-out distribuido; un worker procesa un trabajo a la vez y paraleliza elementos con
  goroutines.
- Si en el futuro se requiere escalar workers, el protocolo ya soporta múltiples propietarios sin
  brokers, pero el limitador por cuenta debería compartirse fuera del proceso.
