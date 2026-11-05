# Entorno Docker

TERRA se distribuye como un **entorno de desarrollo local**. Docker es el único
entorno de ejecución soportado; Go, Node, npm, PostgreSQL, Vite y las herramientas de prueba se
instalan dentro de los contenedores.

## Servicios

| Servicio | Imagen | Comando | Propósito |
|---|---|---|---|
| `web` | `terra-web:local` | `npm run dev -- --host 0.0.0.0 --port 5173` | Servidor de desarrollo Vite, HMR y proxy `/api` |
| `api` | `terra-backend:local` | `air -c .air.api.toml` | API REST y SSE con recarga automática |
| `worker` | `terra-backend:local` | `air -c .air.worker.toml` | Cola de PostgreSQL y transferencias de Drive con recarga automática |
| `db` | `postgres:18-alpine` | PostgreSQL | Fuente de verdad y cola |

La API y el worker comparten la imagen de desarrollo del backend, pero Air usa configuraciones independientes.
No hay Nginx, Traefik, Redis, broker, Compose de producción ni contenedor auxiliar.

## Requisitos del host

- Docker Engine/Desktop con acceso al daemon.
- Docker Compose v2.
- Bash, curl, tar, sha256sum, git.
- No se necesita Go, Node, npm, PostgreSQL, Vite ni compiladores en el host.

## Puertos

| Puerto | Uso |
|---|---|
| `${WEB_PORT:-8080}` | Acceso del navegador a Vite |
| `5173` | Vite dentro del contenedor web |
| `${DB_PORT}` (obligatorio en `.env`) | PostgreSQL vinculado solo a 127.0.0.1 |
| `8080` | API dentro de la red de Docker |

Vite redirige `/api` (REST y SSE) mediante proxy a `http://api:8080`. La comunicación
entre contenedores usa los nombres de servicio, nunca `localhost`.

`DB_PORT` no tiene valor por defecto: Compose falla si falta en `.env`. El puerto interno
de PostgreSQL es siempre `5432`; `DB_PORT` solo cambia la publicación en loopback.
Los parámetros de conexión externa y su uso desde DBeaver están en
[database-development.md](database-development.md).

## Volúmenes y montajes

| Recurso | Tipo | Propósito |
|---|---|---|
| `terra_terra-db` | volumen nombrado | Datos de PostgreSQL |
| `node_modules` | capa de imagen | dependencias del frontend instaladas durante el build |
| `../backend:/src` | bind | código Go, edición en vivo |
| `../frontend/{src,public,tests,...}` | binds individuales | código React, HMR y pruebas |
| `../data/dev:/var/lib/terra` | bind | documentos, ro para la API y rw para el worker |
| `../.cache/go-mod`, `../.cache/go-build` | bind | cachés de Go propiedad del usuario del host |

El directorio `.git` del repositorio **no** se monta en los contenedores. Los contextos
de build de Docker excluyen `.git`, `.github`, cachés, `node_modules`, `dist`, informes
de pruebas y secretos de entorno mediante `.dockerignore`.

## Persistencia de datos

`./terra down` detiene los contenedores y conserva los datos. `./terra down --remove`
elimina los contenedores y la red pero **nunca** los volúmenes, PostgreSQL ni los
documentos.

## Imágenes

```bash
./terra build
./terra build --no-cache
./terra build web
./terra build api
```

El objetivo de desarrollo incluye Go, Air y las herramientas de prueba. Los cambios
Go se recargan con Air sin reconstruir la imagen.

PostgreSQL usa la imagen fijada `postgres:18-alpine` y no se reconstruye.

## Desarrollo y producción

- Desarrollo: bind mount de `backend/`, Air y `terra-backend:local`.
- Producción: imagen multi-stage con binarios `/app/{api,worker,migrate,bootstrap}`,
  sin Go, sin Air y sin código fuente montado.
- La etiqueta de producción debe ser inmutable y desplegarse sustituyendo el
  contenedor, no con bind mounts.
