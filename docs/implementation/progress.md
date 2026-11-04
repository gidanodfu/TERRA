# Progreso de implementación

Actualizado: refactorización de distribución exclusivamente local.

## Estado

TERRA funciona como distribución de desarrollo local mediante Docker. Un único
`deploy/compose.yaml` define exactamente `web`, `api`, `worker` y `db`. El host solo
necesita Docker, Compose, Bash y Git.

## Infraestructura

- Vite dev server en `web`, con HMR y proxy `/api`/SSE a `api:8080`.
- API y worker con imagen backend compartida y comandos independientes.
- Go, Node, npm, PostgreSQL y herramientas de pruebas dentro de contenedores.
- PostgreSQL 18 con volumen `terra_terra-db`.
- Dependencias del frontend en la imagen web y cachés Go en `.cache/`.
- Sin Nginx, sin Compose de producción/staging, sin `.env.production`.
- `.env.example` exclusivamente local.
- Comando unificado `./terra` y scripts en `deploy/scripts/`.

## Funcionalidad

- OAuth Google, administración local, Turnstile, sesiones/CSRF y RBAC.
- Perfiles, áreas, cargos, historial, política institucional y auditoría.
- OAuth Drive separado, refresh tokens cifrados y estados de conexión.
- Exploración de Mi unidad, shortcuts, exportación y descarga.
- Cola persistente, leases, cancelaciones, reintentos y snapshots.
- Paneles trabajador/administrador, SSE y exploradores.

## Pruebas ejecutadas

### Automatizadas dentro de Docker

```bash
./terra test backend unit
./terra test backend integration
./terra test frontend unit
./terra test frontend integration
./terra test e2e
./terra test frontend
./terra test all
```

Resultados:

- Backend unit + `go vet`: correcto.
- Backend integration contra `terra_test`: correcto (migraciones, FK compuesta,
  cola/lease/cancelación/idempotencia, sesiones/CSRF, auditoría).
- Frontend unit: 14 pruebas correctas.
- Frontend integration: 6 pruebas correctas.
- Frontend lint/build/coverage: correcto.
- E2E Playwright: 22 pruebas correctas (layout admin, matriz responsive, tablas, formularios, modal, textos largos, panel del trabajador, login, rutas legales, 404, Inter, OAuth, proxy, montaje React, @vite/client, React Refresh, HMR).
- `./terra test all`: correcto.

### Infraestructura local

- `./terra init --rebuild --no-cache`: cuatro servicios healthy, Vite proxy, API,
  PostgreSQL, migraciones y bootstrap verificados.
- Volumen PostgreSQL y usuarios conservados al eliminar contenedores.
- Recuperación con `./terra init` tras eliminar los cuatro contenedores.
- `./terra down --remove` conservó el volumen.
- Backup local, verificación y restauración con marcador comprobados.
- `bash -n` y ShellCheck sin advertencias.
- Build de imágenes sin dependencias de Go/Node en el host.
- Imágenes sin `.git` ni `.env`.
- Corregida la carga del frontend: `node_modules` visible en la imagen web, bind mounts individuales, `up` recrea web y doctor/verify detectan `/@vite/client` incorrecto.
- Añadidas rutas legales públicas independentes y navegación desde el login; contenido marcado como pendiente de aprobación institucional.
- Rediseñado el panel administrativo con sidebar y workspace independientes, superficies rounded, scroll interno sin barras visibles y drawer móvil.
- Corregida la causa raíz del scroll: shell `100dvh`, un único scroll interno, documento sin scroll y sidebar `min-w-0` sin recorte.
- Corregido el aprovechamiento de ancho: shell `max-w-[1920px]` (16 px de margen en 1920) y grids por container queries en dashboard y módulos.
- Corregidos desbordamientos de tablas (`contain: layout` + scroll interno), selects/inputs (`min-w-0` y anchos acotados), textos largos (`wrap-anywhere`) y modales (`92dvh` con cuerpo desplazable).
- Auditado en 320, 375, 430, 768, 960, 1024, 1152, 1280, 1440, 1920 px y alturas de 500–560 px; cuadrículas por container queries y sin scroll horizontal.
- Rediseñado el login como composición centrada de una columna, con paneles de trabajadores/administración, tarjeta legal y tipografía Inter local.

## Pendiente externo

- Consentimiento OAuth real con cuentas personales de prueba.
- Verificación de Google del scope `drive.readonly`.
- Texto aprobado de política institucional.
- Pruebas con archivos reales de Drive (Docs/Sheets/Slides, shortcuts, revocaciones).
- Ejecución remota real del workflow de GitHub Actions (se validó localmente).

## Limitaciones conocidas

- Los contenedores de desarrollo ejecutan las herramientas y el servidor Vite; no
  representan una configuración de producción.
- Las pruebas de integración de Drive usan fixtures y no contactan Google.
- El E2E cubre humo de interfaz, proxy y autenticación anónima; no automatiza el
  consentimiento Google/Turnstile real.
- La restauración debe respetar la `TOKEN_ENCRYPTION_KEY` correspondiente.
