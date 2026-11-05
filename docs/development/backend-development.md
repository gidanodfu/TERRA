# Desarrollo del backend

El backend se ejecuta dentro del contenedor `api` con la toolchain de Go incluida.
No se requiere ninguna instalación de Go en el host.

## Ejecución y edición

`../backend` está montado mediante bind en `/src`. La API se inicia con:

```bash
./terra up
```

El comando del contenedor es `go run ./cmd/api`. Al reiniciar, recompila con el
código fuente actual. Registros:

```bash
./terra logs api -f
```

## Pruebas y vet

```bash
./terra test backend unit
./terra test backend integration
./terra test backend
```

Comandos Docker equivalentes:

```bash
docker compose exec -T api go test ./...
docker compose exec -T api go vet ./...
docker compose exec -T api go test -tags=integration ./tests/integration/...
```

El runner de integración crea una base de datos desechable `terra_test` y la elimina
después. Nunca toca la base de datos de desarrollo.

## Comandos dentro de la imagen

La imagen de la API también contiene los comandos de bootstrap y migraciones:

```bash
./terra migrate up
./terra migrate status
./terra bootstrap
```

Estos se ejecutan con `go run` dentro del contenedor `api`. No hay un contenedor
de migraciones.

## Estructura

```
backend/
├── cmd/{api,worker,bootstrap,migrate}/
├── internal/{auth,users,organization,drive,downloads,storage,admin,audit,platform,server}/
├── migrations/
└── tests/{unit,integration,fixtures,helpers}/
```

Las pruebas unitarias de los paquetes internos viven junto a sus paquetes; el directorio
bajo `tests/unit` está reservado para el comportamiento exportado entre paquetes. Las
pruebas de integración llevan la etiqueta `integration`.

## Cachés de Go

La distribución local monta los directorios del host `.cache/go-mod` y `.cache/go-build`
en los contenedores api/worker. Esto mantiene rápidas las descargas y compilaciones sin
instalar Go en el host.

## Reconstrucción

```bash
./terra build api
./terra up
```

## Shell

```bash
./terra shell api
go test ./...
```
