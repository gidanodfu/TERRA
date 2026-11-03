# Debugging

## First commands

```bash
./terra check
./terra status
./terra doctor
./terra logs
```

`doctor.sh` checks Docker, Compose, services, PostgreSQL, migrations, Vite proxy,
API, storage, volumes, recent worker errors and backups. It returns non-zero when it
finds a problem and never prints secrets.

## Shells

```bash
./terra shell api
./terra shell worker
./terra shell web
./terra shell db
./terra db
```

Inside the API/worker shell the Go toolchain is available:

```bash
go test ./...
go vet ./...
```

Inside the web shell:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Inspect a service

```bash
./terra logs api -n 300
./terra logs worker -f
./terra restart api
./terra restart worker
```

## Database

```bash
./terra db
./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"
./terra migrate status
```

## Pantalla en blanco y errores de Vite

### Síntoma

La página carga en `http://localhost:8080` pero queda en blanco; la consola muestra
errores de `/@vite/client` o React Refresh.

### Diagnóstico

```bash
curl -sS -D - -o /dev/null http://localhost:8080/@vite/client
docker compose exec -T web test -f node_modules/vite/dist/client/client.mjs && echo ok
./terra doctor
```

`/@vite/client` debe responder `Content-Type: text/javascript` y un cuerpo JavaScript
de Vite. Si responde `text/html`, Vite no puede leer su propio cliente y su fallback
SPA devuelve `index.html`.

### Causa raíz conocida

El contenedor web había quedado con un bind mount de todo el frontend sobre `/app` y
un volumen de `node_modules` desalineado; `/app/node_modules` no era visible. Vite no
podía servir su cliente; React no montaba. Un contenedor viejo reutilizado agravaba el
problema.

La arquitectura corregida monta únicamente `src`, `public`, `tests` y configuraciones,
mantiene `node_modules` dentro de la imagen y fuerza la recreación de web en
`./terra up`.

### Corrección

```bash
./terra build web
./terra up
./terra doctor
```

No se desactiva HMR ni React Refresh. No se parchea el puerto para ocultar el fallo.

## SSE and proxy

The SSE endpoint is under `/api/v1/download-jobs/{id}/events`. Vite proxies it to
`api:8080`. Verify:

```bash
curl -i http://localhost:8080/api/v1/health
curl -i http://localhost:8080/api/v1/auth/me
```

The second must return `401` without a session.

## Build issues

```bash
./terra build --no-cache
```

Backend and frontend dependencies are installed inside Docker. A lockfile change
requires rebuilding the corresponding image.

## No destructive shortcuts

Do not delete volumes, databases or documents to “fix” a startup problem. Use
`./terra doctor`, logs, backups and restore procedures.
