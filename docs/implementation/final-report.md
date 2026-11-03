# Informe final — distribución de desarrollo local

## 1. Distribución

TERRA se entrega como entorno de desarrollo local basado exclusivamente en Docker.
Conserva la estructura `deploy/`, `backend/`, `frontend/`, `docs/` y añade el comando
raíz `./terra`.

## 2. Arquitectura implementada

```
web (Vite + React) ──/api──► api (Go REST + SSE) ──► db (PostgreSQL)
                                     ▲                    ▲
                                     │                    │
                             worker (Go) ─────────────────┘
                                     │
                               data/dev
```

Exactamente cuatro servicios. Sin Nginx, broker, Redis ni contenedores auxiliares.

## 3. Funcionalidades completadas

- OAuth Google, login local Argon2id, Turnstile, sesiones, CSRF y RBAC.
- Perfiles, áreas, cargos, historial, política y auditoría.
- OAuth Drive separado, tokens cifrados, estados de conexión y reconexión.
- Exploración de Mi unidad, shortcuts, exportación y descarga.
- Cola PostgreSQL, leases, heartbeat, cancelación, reintentos e idempotencia.
- Almacenamiento privado con rutas seguras, checksums y escritura atómica.
- Paneles trabajador/administrador, SSE, dashboard y exploradores.
- Scripts de operación local, backups y recuperación.
- Pruebas unitarias, integración, E2E y CI Docker-only.

## 4. Funcionalidades pendientes externas

- Consentimiento real con cuentas de Google de prueba.
- Verificación de Google del scope restringido.
- Contenido legal aprobado de la política.
- Pruebas con archivos reales de Drive.
- Ejecución remota del workflow en GitHub Actions.

## 5. Estructura

```
TERRA/
├── terra                     # interfaz única
├── deploy/
│   ├── compose.yaml          # único Compose local
│   └── scripts/              # operación local
├── backend/
│   ├── cmd/{api,worker,bootstrap,migrate}/
│   ├── internal/
│   ├── migrations/
│   └── tests/{unit,integration,fixtures,helpers}/
├── frontend/
│   ├── src/
│   ├── tests/{unit,integration,fixtures,helpers,e2e}/
│   ├── Dockerfile
│   └── package.json
├── docs/
└── .github/workflows/ci.yml
```

## 6. Servicios

| Servicio | Imagen | Función |
|---|---|---|
| `web` | `terra-web:local` | Vite, React, proxy `/api` |
| `api` | `terra-backend:local` | REST, SSE, OAuth |
| `worker` | `terra-backend:local` | cola y transferencias |
| `db` | `postgres:18-alpine` | PostgreSQL |

## 7. Variables

`.env.example` representa exclusivamente el entorno local. Incluye configuración de
aplicación, PostgreSQL, Google, Turnstile, cifrado, almacenamiento, worker, límites y
bootstrap. No incluye secretos reales ni variables de producción.

## 8. Inicio

```bash
cp .env.example .env
chmod 600 .env
# completar valores locales
./terra init
```

Acceso: `http://localhost:8080`.

## 9. Bootstrap

`./terra init` ejecuta `go run ./cmd/bootstrap` dentro del contenedor `api` tras las
migraciones. Es idempotente y no sobrescribe credenciales. También puede ejecutarse
con `./terra bootstrap`.

## 10. Migraciones

Migraciones embebidas aplicadas por la API al arrancar y por
`./terra migrate up`. Advisory lock, registro en `schema_migrations`, sin contenedor
adicional y sin rollback automático.

## 11. Pruebas ejecutadas

- `./terra test backend unit` + `go vet`: correcto.
- `./terra test backend integration` contra `terra_test`: correcto.
- `./terra test frontend unit`: 14 pruebas correctas.
- `./terra test frontend integration`: 6 pruebas correctas.
- `./terra test frontend`: lint, build y cobertura correctos.
- `./terra test e2e`: 6 pruebas Playwright correctas (montaje React, Vite client, React Refresh, proxy, HMR).
- `./terra test all`: validación integrada correcta.
- Recuperación tras eliminar contenedores conservando volumen.
- Backup local, verificación y restauración con marcador.

## 12. Integración continua

`.github/workflows/ci.yml` se ejecuta en push, PR y manualmente. Usa Docker, crea un
`.env` ficticio, valida, construye, inicializa y ejecuta `./terra test all`. Publica
artifacts y recopila logs en fallos. No despliega a ningún servidor.

## 13. Riesgos residuales

- Los contenedores de desarrollo no son una configuración productiva.
- Las pruebas E2E no cubren el consentimiento Google/Turnstile real.
- El adaptador de Drive no se probó contra archivos reales en esta ejecución.
- La pérdida de `TOKEN_ENCRYPTION_KEY` obliga a reconectar Drive.
- La CI remota debe verificarse en GitHub Actions.

## 14. Backups locales

```bash
./terra backup
./terra restore
```

Se conservan PostgreSQL, documentos, metadatos y checksums. La clave de cifrado se
respalda por separado. Las pruebas de recuperación no eliminan volúmenes.

## 15. Corrección de la carga del frontend

Se investigó una pantalla en blanco con errores de `/@vite/client` y React Refresh.
La causa raíz fue el montaje de dependencias: el contenedor web no tenía visible
`/app/node_modules` (bind de `/app` + volumen desalineado), por lo que Vite no podía
servir su propio cliente y su fallback SPA devolvía `index.html`; React no montaba.

Corrección:
- se montan individualmente `src`, `public`, `tests` y configuraciones;
- `node_modules` permanece dentro de la imagen web;
- `./terra up` fuerza la recreación de web;
- el healthcheck de web valida `/@vite/client` como JavaScript;
- `./terra doctor` y `terra_verify_stack` comprueban puerto, dependencias, Vite client,
  React Refresh y módulos;
- E2E comprueba montaje de React y WebSocket HMR.
