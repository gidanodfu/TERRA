# Depuración

## Primeros comandos

```bash
./terra check
./terra status
./terra doctor
./terra logs
```

`doctor.sh` comprueba Docker, Compose, servicios, PostgreSQL, migraciones, proxy de
Vite, API, almacenamiento, volúmenes, errores recientes del worker y copias de
seguridad. Devuelve un código distinto de cero cuando encuentra un problema y nunca
imprime secretos.

## Shells

```bash
./terra shell api
./terra shell worker
./terra shell web
./terra shell db
./terra db
```

Dentro del shell de la API/worker la toolchain de Go está disponible:

```bash
go test ./...
go vet ./...
```

Dentro del shell de web:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
```

## Inspeccionar un servicio

```bash
./terra logs api -n 300
./terra logs worker -f
# Reinicio manual excepcional; Air ya recarga los cambios Go.
./terra restart api
./terra restart worker
```

## Base de datos

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

## SSE y proxy

El endpoint SSE está en `/api/v1/download-jobs/{id}/events`. Vite lo redirige mediante
proxy a `api:8080`. Verifica:

```bash
curl -i http://localhost:8080/api/v1/health
curl -i http://localhost:8080/api/v1/auth/me
```

El segundo debe devolver `401` sin sesión.

## Problemas de compilación

```bash
./terra build --no-cache
```

Las dependencias del backend y del frontend se instalan dentro de Docker. Un cambio en
el lockfile requiere reconstruir la imagen correspondiente.

## Sin atajos destructivos

No elimines volúmenes, bases de datos ni documentos para “arreglar” un problema de
arranque. Usa `./terra doctor`, los logs, las copias de seguridad y los procedimientos
de restauración.
