# Backend development

The backend runs inside the `api` container with the Go toolchain included.
No Go installation is required on the host.

## Run and edit

`../backend` is bind-mounted at `/src`. The API starts with:

```bash
./terra up
```

The container command is `go run ./cmd/api`. On restart it recompiles with the
current source. Logs:

```bash
./terra logs api -f
```

## Tests and vet

```bash
./terra test backend unit
./terra test backend integration
./terra test backend
```

Equivalent Docker commands:

```bash
docker compose exec -T api go test ./...
docker compose exec -T api go vet ./...
docker compose exec -T api go test -tags=integration ./tests/integration/...
```

The integration runner creates a disposable `terra_test` database and drops it
afterwards. It never touches the development database.

## Commands inside the image

The API image also contains the bootstrap and migration commands:

```bash
./terra migrate up
./terra migrate status
./terra bootstrap
```

These run with `go run` inside the `api` container. There is no migrations
container.

## Structure

```
backend/
├── cmd/{api,worker,bootstrap,migrate}/
├── internal/{auth,users,organization,drive,downloads,storage,admin,audit,platform,server}/
├── migrations/
└── tests/{unit,integration,fixtures,helpers}/
```

Unit tests for internal packages live alongside their packages; the directory under
`tests/unit` is reserved for exported cross-package behavior. Integration tests are
tagged `integration`.

## Go caches

The local distribution mounts host directories `.cache/go-mod` and `.cache/go-build`
into the API/worker containers. This keeps downloads and builds fast without
installing Go on the host.

## Rebuild

```bash
./terra build api
./terra up
```

## Shell

```bash
./terra shell api
go test ./...
```
