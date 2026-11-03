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

`../frontend` is bind-mounted at `/app`. Changes to `src/` are reflected through
Vite HMR. `node_modules` lives in a container anonymous volume and is never installed on the host.
Rebuild and recreate the web service after changing dependencies.

After changing `package.json` or `package-lock.json`, rebuild the web image:

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
