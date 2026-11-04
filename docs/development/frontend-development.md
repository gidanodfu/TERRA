# Frontend development

The `web` container runs the Vite development server with hot module replacement.

## Access

```text
http://localhost:8080
```

Port `8080` on the host maps to Vite `5173` inside the container. Change the host
port with `WEB_PORT` in `.env`.

## Stack

- React 19
- Vite 8
- Tailwind CSS 4
- Lucide icons
- React Router
- Vitest + React Testing Library
- Playwright + Chromium inside the container

## Live editing

Source files under `src/`, `public/`, `tests/` and development configs are bind-mounted into `/app`. Changes to `src/` are reflected through Vite HMR.

`node_modules` is installed in the web image with `npm ci` during the build and is not bind-mounted from the host. A local `frontend/node_modules` is not part of TERRA's operational flow; if it exists, it is a residual from a manual host install and does not affect Docker.

`npm`, Vite, Vitest and Playwright run inside the `web` container:

```bash
./terra shell web                                  # interactive shell
docker compose exec -T web npm run test:unit       # one-off command
docker compose exec -T web npm run lint
```

After changing `package.json` or `package-lock.json`, rebuild and recreate the web service:

```bash
./terra build web
./terra up
```

Node.js is not required on the host; it is only part of the web image.

## Vite client y React Refresh

El doctor verifica que `/@vite/client` se sirva como JavaScript, que React Refresh
esté disponible y que la app monte en `#root`:

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

## API and SSE proxy

`vite.config.js` proxies `/api` to `http://api:8080`. This includes REST and
Server-Sent Events. Do not use `localhost` for container-to-container traffic.

## Frontend tests

```bash
./terra test frontend unit
./terra test frontend integration
./terra test e2e
./terra test frontend       # lint + unit + integration + build + coverage
```

Tests run inside the `web` container:

```bash
docker compose exec -T web npm run test:unit
docker compose exec -T web npm run test:integration
docker compose exec -T web npm run test:e2e
```

## Shell and build

```bash
./terra shell web
./terra build
```

Build output inside the container is written to `/tmp` during tests; the host is
not polluted with compiled artifacts.

## Lint

```bash
docker compose exec -T web npm run lint
```

No Node installation is required on the host.
