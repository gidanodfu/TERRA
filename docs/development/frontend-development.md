# Desarrollo de frontend

El contenedor `web` ejecuta el servidor de desarrollo de Vite con reemplazo de módulos en caliente (HMR).

## Acceso

```text
http://localhost:8080
```

El puerto `8080` del host se asigna al `5173` de Vite dentro del contenedor. Cambie el puerto
del host con `WEB_PORT` en `.env`.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Iconos Lucide
- React Router
- Vitest + React Testing Library
- Playwright + Chromium dentro del contenedor

## Edición en vivo

Los archivos fuente bajo `src/`, `public/`, `tests/` y las configuraciones de desarrollo se montan mediante bind en `/app`. Los cambios en `src/` se reflejan a través del HMR de Vite.

`node_modules` se instala en la imagen web con `npm ci` durante el build y no se monta desde el host. Un `frontend/node_modules` local no forma parte del flujo operativo de TERRA; si existe, es un residuo de una instalación manual en el host y no afecta a Docker.

`npm`, Vite, Vitest y Playwright se ejecutan dentro del contenedor `web`:

```bash
./terra shell web                                  # shell interactiva
docker compose exec -T web npm run test:unit       # comando puntual
docker compose exec -T web npm run lint
```

Después de cambiar `package.json` o `package-lock.json`, reconstruya y recree el servicio web:

```bash
./terra build web
./terra up
```

No se requiere Node.js en el host; solo forma parte de la imagen web.

## Cliente de Vite y React Refresh

El doctor verifica que `/@vite/client` se sirva como JavaScript, que React Refresh
esté disponible y que la aplicación monte en `#root`:

```bash
./terra doctor
./terra test e2e
```

Si `/@vite/client` devuelve HTML, el contenedor web no puede leer sus dependencias.
Reconstruya y recree:

```bash
./terra build web
./terra up
```

## Proxy de API y WebSocket

`vite.config.js` redirige `/api` a `http://api:8080`. Esto incluye REST y
Server-Sent Events. No use `localhost` para el tráfico entre contenedores.

## Pruebas de frontend

```bash
./terra test frontend unit
./terra test frontend integration
./terra test e2e
./terra test frontend       # lint + unitarias + integración + build + cobertura
```

Las pruebas se ejecutan dentro del contenedor `web`:

```bash
docker compose exec -T web npm run test:unit
docker compose exec -T web npm run test:integration
docker compose exec -T web npm run test:e2e
```

## Shell y compilación

```bash
./terra shell web
./terra build
```

La salida del build dentro del contenedor se escribe en `/tmp` durante las pruebas; el host
no se contamina con artefactos compilados.

## Lint

```bash
docker compose exec -T web npm run lint
```

No se requiere ninguna instalación de Node en el host.
