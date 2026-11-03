# Docker environment

TERRA is distributed as a **local development environment**. Docker is the only
supported runtime; Go, Node, npm, PostgreSQL, Vite and test tools are installed
inside containers.

## Services

| Service | Image | Command | Purpose |
|---|---|---|---|
| `web` | `terra-web:local` | `npm run dev -- --host 0.0.0.0 --port 5173` | Vite dev server, HMR and `/api` proxy |
| `api` | `terra-backend:local` | `go run ./cmd/api` | REST API and SSE |
| `worker` | `terra-backend:local` | `go run ./cmd/worker` | PostgreSQL queue and Drive transfers |
| `db` | `postgres:18-alpine` | PostgreSQL | Source of truth and queue |

API and worker share the backend image but have independent commands. There is no
Nginx, Traefik, Redis, broker, production Compose or auxiliary container.

## Host requirements

- Docker Engine/Desktop with daemon access.
- Docker Compose v2.
- Bash, curl, tar, sha256sum, git.
- No Go, Node, npm, PostgreSQL, Vite or compilers on the host.

## Ports

| Port | Usage |
|---|---|
| `${WEB_PORT:-8080}` | Browser access to Vite |
| `5173` | Vite inside the web container |
| `${DB_PORT:-5432}` | PostgreSQL bound to 127.0.0.1 only |
| `8080` | API inside the Docker network |

Vite proxies `/api` (REST and SSE) to `http://api:8080`. Container-to-container
communication uses service names, never `localhost`.

## Volumes and mounts

| Resource | Type | Purpose |
|---|---|---|
| `terra_terra-db` | named volume | PostgreSQL data |
| `node_modules` | image layer | frontend dependencies installed during build |
| `../backend:/src` | bind | Go source, live edits |
| `../frontend/{src,public,tests,...}` | binds individuales | React source, HMR y tests |
| `../data/dev:/var/lib/terra` | bind | documents, ro for API and rw for worker |
| `../.cache/go-mod`, `../.cache/go-build` | bind | Go caches owned by the host user |

The repository `.git` directory is **not** mounted into containers. Docker build
contexts exclude `.git`, `.github`, caches, `node_modules`, `dist`, test reports and
environment secrets through `.dockerignore`.

## Data persistence

`./terra down` stops containers and keeps data. `./terra down --remove` removes
containers and the network but **never** volumes, PostgreSQL or documents.

## Images

```bash
./terra build
./terra build --no-cache
./terra build web
./terra build api
```

PostgreSQL uses the pinned `postgres:18-alpine` image and is not rebuilt.
