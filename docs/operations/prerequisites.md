# Prerequisites

## Sistema operativo

- Linux x86_64 o arm64 con Bash 4+.
- Docker Engine **24.0+**.
- Plugin **Docker Compose v2.20+** (`docker compose`, no `docker-compose`).
- Reloj sincronizado (NTP).
- `curl`, `tar`, `gzip`, `sha256sum`, `base64`, `realpath`, `awk`, `sed`, `find`, `stat`.
- `git` para clonar y para registrar el commit en los backups.

Los scripts fuerzan `set -Eeuo pipefail`, resuelven rutas absolutas y funcionan desde cualquier
directorio.

## Hardware recomendado

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco | 20 GB + documentos | Dimensionar según volumen documental |
| Red | Salida HTTPS a Google/Cloudflare | Salida estable y monitoreada |

El límite de disco real depende de `MAX_*_STORAGE_BYTES`, `MIN_FREE_DISK_BYTES` y del
almacenamiento institucional aprobado.

## Permisos

- El usuario operador debe poder ejecutar Docker (`docker info`).
- **Desarrollo:** debe poder escribir en `STORAGE_HOST_PATH` (por defecto `deploy/../data/dev`).
- **Producción:** el volumen documental debe pertenecer a **UID/GID 10001** (usuario de las
  imágenes API/worker). La preparación inicial puede requerir `sudo`:

```bash
sudo mkdir -p /srv/terra-data/prod/{staging,areas}
sudo chown -R 10001:10001 /srv/terra-data/prod
sudo chmod 750 /srv/terra-data/prod /srv/terra-data/prod/staging /srv/terra-data/prod/areas
```

- Los scripts de producción no elevan privilegios automáticamente.

## Puertos

| Servicio | Desarrollo | Producción |
|---|---|---|
| web | `${WEB_PORT:-8080}` publicado | detrás de TLS/proxy institucional |
| api | interno 8080 | interno |
| worker | interno | interno |
| db | `127.0.0.1:${DB_PORT:-5432}` solo dev | **no publicado** |

## Configuración externa necesaria

1. Cliente OAuth **External** de Google con redirect URIs registradas.
2. Google Drive API v3 habilitada.
3. Widget y claves de Cloudflare Turnstile del dominio.
4. Texto de política institucional aprobado.
5. Límites de capacidad aprobados.
6. `TOKEN_ENCRYPTION_KEY` custodiada por separado.

## Verificación rápida

```bash
docker version
docker compose version
curl --version | head -1
./deploy/scripts/check.sh dev
```

Si `check.sh` falla, muestra la comprobación, el motivo y la acción correctiva.

## Referencias

- Docker Engine: https://docs.docker.com/engine/install/
- Docker Compose: https://docs.docker.com/compose/install/
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- Turnstile: https://developers.cloudflare.com/turnstile/get-started/
