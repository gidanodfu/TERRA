# Resolución de problemas

## Docker no está en ejecución

**Identificar:** `./terra check` falla en el daemon de Docker.
**Corrección:** inicie Docker/Desktop y verifique `docker info`.
**Verificar:** `./terra check`.

## Falta Compose

**Identificar:** falla `docker compose version`.
**Corrección:** instale el plugin de Compose v2.
**Verificar:** `./terra check`.

## .env faltante o inválido

**Identificar:** `./terra check` indica la variable o el archivo faltante.
**Corrección:**

```bash
cp .env.example .env
chmod 600 .env
# completa los valores locales
```

**Verificar:** `./terra check`.

## Puerto ocupado

**Identificar:** `./terra up` no puede enlazar 8080 o 5432.
**Corrección:** detenga el proceso en conflicto o cambie `WEB_PORT`/`DB_PORT`.
**Verificar:** `./terra status`.

## PostgreSQL no saludable

**Identificar:** `db` no está saludable.
**Registros:** `./terra logs db`.
**Corrección:** revise credenciales, espacio en disco y compatibilidad del volumen. No elimine el
volumen.
**Verificar:** `./terra doctor`.

## API no saludable

**Identificar:** `api` no está saludable.
**Registros:** `./terra logs api`.
**Causas:** `.env` inválido, almacenamiento faltante, base de datos, error de migración.
**Corrección:** corrija la causa y luego ejecute `./terra up`.
**Verificar:** `./terra status` y `/api/v1/ready`.

## Worker sin procesar

**Identificar:** los jobs permanecen en cola.
**Registros:** `./terra logs worker`.
**Corrección:** verifique el contenedor del worker, la conectividad con la base de datos y la política/autorización de jobs.
**Verificar:** `./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"`.

## Página en blanco / errores de /@vite/client

**Identificar:** UI en blanco; el navegador solicita `/@vite/client` y recibe 404 o HTML.
**Causa:** el contenedor web no puede ver su `node_modules/vite` de la capa de imagen
(imagen incompleta o desactualizada), o un servidor estático está sirviendo el HTML de desarrollo.
`node_modules` no se monta desde el host.
**Diagnóstico:**

```bash
curl -sS -D - -o /dev/null http://localhost:8080/@vite/client
docker compose exec -T web test -f node_modules/vite/dist/client/client.mjs && echo ok
./terra doctor
```

La respuesta debe ser `Content-Type: text/javascript`.
**Corrección:**

```bash
./terra build web
./terra up
```

`up` fuerza la recreación de web para que no persistan montajes obsoletos.
**Verificar:** `./terra doctor` y `./terra test e2e`.

## Vite inaccesible

**Identificar:** falla `http://localhost:8080`.
**Registros:** `./terra logs web`.
**Corrección:** reconstruya web después de cambios en el lockfile (`./terra build web`), verifique el puerto y
el proxy de Vite.
**Verificar:** `curl -i http://localhost:8080/api/v1/health`.

## Fallo de proxy/API

**Identificar:** el frontend carga pero las llamadas a la API fallan.
**Registros:** `./terra logs web api`.
**Corrección:** verifique la salud de la API y el destino de `VITE_API_PROXY` `http://api:8080`.
**Verificar:** `./terra doctor`.

## Fallo de migración

**Identificar:** API no saludable o falla `./terra migrate up`.
**Registros:** `./terra logs api`.
**Corrección:** restaure una copia de seguridad local si el esquema es inconsistente; agregue una nueva migración para
cambios futuros. No edite una migración ya aplicada.
**Verificar:** `./terra migrate status`.

## Fallan las pruebas

```bash
./terra test backend unit
./terra test backend integration
./terra test frontend unit
./terra test frontend integration
./terra test e2e
```

Revise `artifacts/tests/` y los logs de los servicios. Las pruebas de integración usan una base de datos
desechable; no alteran los datos de desarrollo.

## Playwright/Chromium falla

Chromium está instalado en la imagen web. Reconstruya la imagen web:

```bash
./terra build web --no-cache
./terra up
```

Ejecute `./terra test e2e` o `docker compose exec -T web npm run test:e2e` para más detalles.

## Contenedor eliminado accidentalmente

```bash
./terra init
```

Los volúmenes y documentos permanecen. No cree una nueva base de datos vacía si el volumen
falta y existen documentos o copias de seguridad; en su lugar, restaure.

## Volumen faltante

**Identificar:** `./terra status` muestra el volumen faltante.
**Corrección:** busque copias de seguridad locales y restaure:

```bash
./terra restore backups/<timestamp>
```

Los scripts nunca eliminan volúmenes automáticamente.

## Disco insuficiente

**Corrección:** libere espacio o ajuste los límites de capacidad locales. No elimine la base de datos.
**Verificar:** `./terra status`.

## Registros

```bash
./terra logs
./terra logs api -n 500
./terra logs worker -f
```
