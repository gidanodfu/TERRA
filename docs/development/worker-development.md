# Desarrollo de worker

El worker es un contenedor independiente que usa la misma imagen de backend que la API.

## Inicio e inspección

```bash
./terra up
./terra logs worker -f
./terra status
```

Comando de desarrollo: `air -c .air.worker.toml`.
Toma jobs de PostgreSQL con `FOR UPDATE ... SKIP LOCKED`, mantiene una lease
y un heartbeat, escanea Drive, descarga o exporta archivos, escribe de forma atómica y
actualiza el progreso.

## Ediciones y recarga automática

El código fuente del backend se monta mediante bind en `/src`. Air recompila y reinicia
el worker automáticamente cuando cambian:

- `cmd/worker/`;
- `internal/`;
- `migrations/`;
- `go.mod` o `go.sum`.

No es necesario ejecutar `./terra restart worker` tras cambios Go. El reinicio manual
solo se usa para diagnóstico excepcional.

Los cambios compartidos en `internal/` recargan API y worker. Un cambio exclusivo de
`cmd/worker` no reinicia la API. Los binarios temporales están en `/tmp/air-worker`.

Si cambia `.env`, hay que recrear el contenedor para inyectar el nuevo entorno:

```bash
./terra up --recreate=worker
```

Reconstruya la imagen solo si cambian dependencias nativas, el Dockerfile o Compose:

```bash
./terra build api
./terra up
```

## Comprobaciones de la cola

```bash
./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"
./terra db -c "SELECT id, status, attempt_count, error_code FROM download_items ORDER BY started_at DESC LIMIT 20;"
./terra db -c "SELECT max(heartbeat_at) FROM download_jobs;"
```

## Cancelación y leases

- La cancelación se solicita a través de la API y el heartbeat la observa.
- Las leases expiradas se pueden recuperar tras un reinicio del worker.
- Una lease perdida no finaliza el job; el nuevo propietario lo reanuda.
- Los elementos completados no se descargan de nuevo.
- Air envía SIGINT y espera el cierre ordenado antes de forzar el proceso.

## Pruebas

El comportamiento de la cola del worker está cubierto por las pruebas de integración de backend:

```bash
./terra test backend integration
```

Las pruebas validan la exclusividad del claim, el heartbeat, la cancelación, la idempotencia y
el listado restringido de jobs contra PostgreSQL. Estas pruebas no contactan con el HTTP de Drive
en sí; las pruebas externas de Drive requieren credenciales controladas y son manuales.

## Almacenamiento

El worker monta `STORAGE_HOST_PATH` en lectura/escritura:

```text
$STORAGE_HOST_PATH → /var/lib/terra
```

La API la monta en solo lectura. La ruta externa se define en `.env` y debe quedar fuera
del repositorio.
