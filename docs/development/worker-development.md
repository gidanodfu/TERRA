# Desarrollo de worker

El worker es un contenedor independiente que usa la misma imagen de backend que la API.

## Inicio e inspección

```bash
./terra up
./terra logs worker -f
./terra status
```

Comando: `go run ./cmd/worker`.
Toma jobs de PostgreSQL con `FOR UPDATE ... SKIP LOCKED`, mantiene una lease
y un heartbeat, escanea Drive, descarga o exporta archivos, escribe de forma atómica y
actualiza el progreso.

## Ediciones

El código fuente del backend se monta mediante bind. Reinicie solo el worker tras cambios en el backend:

```bash
./terra restart worker
```

o reconstruya/inicie:

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

## Pruebas

El comportamiento de la cola del worker está cubierto por las pruebas de integración de backend:

```bash
./terra test backend integration
```

Las pruebas validan la exclusividad del claim, el heartbeat, la cancelación, la idempotencia y
el listado restringido de jobs contra PostgreSQL. Estas pruebas no contactan con el HTTP de Drive
en sí; las pruebas externas de Drive requieren credenciales controladas y son manuales.

## Almacenamiento

El worker monta la ruta local de documentos en lectura/escritura:

```text
../data/dev → /var/lib/terra
```

La API la monta en solo lectura.
