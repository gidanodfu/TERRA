# Pruebas

## Principios

- Todas las pruebas se ejecutan dentro de Docker (contenedores `api` y `web`).
- No se requiere instalar Go, Node, npm, Vitest ni Playwright en el host.
- Las suites normales no usan credenciales reales de Google ni de Turnstile.
- Las pruebas nunca modifican la base de datos PostgreSQL de desarrollo.
- Los fallos propagan los códigos de salida reales; ninguna suite se informa como exitosa si se omitió.

## Estructura de directorios

```
frontend/tests/
├── unit/
├── integration/
├── fixtures/
├── helpers/
└── e2e/

backend/tests/
├── unit/
├── integration/
├── fixtures/
└── helpers/
```

Las pruebas internas de Go también permanecen junto a sus paquetes, siguiendo las convenciones de Go.

## Herramientas

| Área | Herramienta |
|---|---|
| Backend | Go `testing`, `httptest`, pgx |
| Unitarias/integración de frontend | Vitest, React Testing Library, jsdom |
| E2E de frontend | Playwright + Chromium dentro de `web` |
| Base de datos de integración | Contenedor PostgreSQL, `terra_test` desechable |
| Cobertura | Coverprofile de Go, Vitest v8 |
| CI | GitHub Actions solo con Docker |

## Comandos

```bash
./terra test                  # todas las suites, incluida E2E
./terra test all
./terra test unit
./terra test integration
./terra test backend
./terra test backend unit
./terra test backend integration
./terra test frontend
./terra test frontend unit
./terra test frontend integration
./terra test e2e
```

Los resultados y la cobertura se escriben en `artifacts/` (ignorado por Git).

## Pruebas unitarias de backend

- Pruebas existentes de paquetes en `backend/internal/**`.
- Pruebas exportadas entre paquetes en `backend/tests/unit`.
- Funciones puras, validación, límite de tasa, traducción de errores, permisos,
  tipos MIME de exportación y helpers de estado.
- También se ejecuta `go vet ./...`.

## Pruebas de integración de backend

Etiqueta de build: `integration`. Ejecutor de pruebas:

```bash
./terra test backend integration
```

El script crea `terra_test`, pasa `TEST_DATABASE_URL` al contenedor `api`,
ejecuta las pruebas y elimina la base de datos. Si la base de datos no está disponible, la suite
falla.

Comportamiento cubierto:

- migraciones y seed de roles del sistema;
- integridad de la FK compuesta `(position, area)`;
- toma de la cola con lease activa, heartbeat y cancelación;
- repetición de claves de idempotencia;
- listado restringido de jobs para workers no administradores;
- persistencia de eventos de job;
- persistencia de auditoría;
- validación CSRF de sesión e invalidación de sesión por suspensión.

Los fixtures están en `backend/tests/fixtures` (convenciones de datos) y los helpers abren/reinician
la base de datos desechable. Las pruebas son secuenciales e independientes.

## Pruebas unitarias de frontend

`frontend/tests/unit` cubre:

- formateo y cálculos de progreso;
- cliente HTTP, cabecera CSRF, cuerpos JSON y errores estables de API;
- badges de estado;
- comportamiento del hook SSE con un doble controlado de EventSource.

## Pruebas de integración de frontend

`frontend/tests/integration` cubre:

- carga de sesión en `AuthProvider`, permisos, logout y manejo de 401;
- renderizado de la tabla de jobs con routing;
- validación del formulario de perfil, dependencia área/puesto y envío a la API.

El HTTP externo está mockeado; estas pruebas no requieren backend.

## E2E

`frontend/tests/e2e` usa Playwright dentro del contenedor `web` contra el servidor
de desarrollo de Vite en ejecución y su proxy `/api`. Valida:

- renderizado de la página de login y montaje de React en `#root`;
- cliente de Vite y React Refresh servidos como JavaScript;
- módulos fuente y respuestas de módulos CSS;
- proxy de Vite llegando a la API;
- redirección de rutas protegidas y 401 anónimo;
- conexión WebSocket de HMR;
- Inter local, estructura visual del login y responsive móvil;
- rutas legales públicas, contenido pendiente, recarga directa y redirección de alias;
- 404 de frontend;
- conservación del redirect OAuth.

Chromium y las dependencias se instalan en la imagen web. No se instala ningún navegador de Playwright
en el host.

### E2E real opt-in

`frontend/tests/e2e/password-change-real.spec.js` valida el cambio de contraseña contra el
backend, PostgreSQL y `/auth/me` reales, sin simular `has_local_credentials`. Se omite en la
suite normal y requiere sesiones temporales y credenciales mediante variables de entorno:

`REAL_E2E_SESSION_<ROL>`, `REAL_E2E_CSRF_<ROL>`, `REAL_E2E_CURRENT_PASSWORD` y
`REAL_E2E_NEW_PASSWORD`, con roles `ADMIN`, `MODERATOR` y `READ_ONLY`.

### Contrato de login

`backend/tests/integration/auth_admin_test.go` ejecuta el handler real de login contra
PostgreSQL y compara su respuesta con `/auth/me` para `admin`, `moderator` y `read_only`:
mismos campos, mismos valores de `has_local_credentials`/`must_rotate_password` y mismos
permisos. También cubre el estado posterior a la rotación de contraseña.

`frontend/tests/e2e/login-security-flow.spec.js` recorre el login en el navegador para los
tres roles y comprueba que el formulario se ve en el primer render de `/app/security`, sin
`/auth/me` intermedio, sin recargar y sin reiniciar servicios. Turnstile se simula porque el
Siteverify real exige un token de Cloudflare.

## Matriz de cobertura de integraciones

| Integración | Módulo | Tipo | Unitarias | Integración | Estado |
|---|---|---|---|---|---|
| Identidad Google OAuth | auth | HTTP externo | helpers de state/PKCE | middleware/sesión DB | Parcial: el consentimiento real es manual |
| Google Drive OAuth/API | drive | HTTP externo | MIME/exportación/clasificación | cola con fixtures de DB | Parcial: el Drive real es manual |
| Turnstile Siteverify | auth | HTTP externo | httptest éxito/fallo/acción/host | — | Cubierto por unitarias |
| Cola PostgreSQL | downloads | DB | limitador/backoff | claim/lease/cancel/idempotencia | Cubierto |
| Integridad de organización | organization/users | DB | slug/normalización | FK compuesta | Cubierto |
| Sesiones/CSRF | auth | DB + HTTP | helpers de token | httptest + DB | Cubierto |
| Auditoría | audit | DB | — | registro/listado | Cubierto |
| Cliente de Vite / montaje de React / HMR | frontend | HTTP + navegador | cliente HTTP | Playwright (47 E2E) | Cubierto |
| Layout de admin / responsive | frontend | Navegador | — | Playwright (320–2560 px, altura 500–1080 px, zoom 200 %, container queries) | Cubierto |
| Shell de worker / scroll / drawer | frontend | Navegador | — | Playwright (320–1920 px, dos superficies, scroll independiente) | Cubierto |
| Tablas, formularios, modales, texto largo | frontend | Navegador | — | Playwright | Cubierto |
| Tema True Black / claro, superficies, dropdowns, persistencia | frontend | Navegador + localStorage | — | Playwright | Cubierto |
| Explorador de archivos y carpetas de Drive | drive + frontend | HTTP + DB + navegador | adapter/API simulada | Go integration + Vitest + Playwright | Cubierto |
| Cambio de contraseña local por rol y `has_local_credentials` | auth + frontend | HTTP + DB + navegador | AuthContext controlado | Go integration + Vitest + Playwright | Cubierto |
| RBAC, cuentas administrativas y navegación por permisos | auth + admin + frontend | HTTP + DB + navegador | Siteverify/widget y API controlados | Go integration + Vitest + Playwright | Cubierto |
| Alineación del footer legal y rutas legales | frontend | Navegador | — | Playwright (2/1 columnas, 320–1920 px) | Cubierto |
| Ancho/foco/resize del textarea de contenido de políticas | frontend | Navegador | — | Playwright | Cubierto |
| Login de admin / ciclo de vida del reset de Turnstile | auth + frontend | HTTP + DB + navegador | Siteverify y widget simulados | Integración Go + Vitest + Playwright | Cubierto |
| SSE | downloads/API | HTTP | hook de cliente | smoke de navegador/proxy | Parcial |
| Proxy de Vite | frontend | HTTP | cliente HTTP | Playwright | Cubierto |
| Almacenamiento local | storage | Sistema de archivos | pruebas de saneamiento/atomicidad | consistency check | Cubierto |

Las integraciones externas reales requieren credenciales explícitas y no forman parte de la
CI por defecto. Nunca deben informarse como verificadas cuando solo se usaron mocks.

## Agregar una nueva integración

1. Agregue pruebas unitarias para su lógica pura y su manejo de errores.
2. Agregue un servidor HTTP controlado (`httptest`/mock) para las pruebas de integración normales.
3. Agregue fixtures/helpers y nunca use credenciales personales.
4. Cubra éxito, timeout, 401/403, 429, respuestas malformadas y reintentos según corresponda.
5. Agregue una prueba externa opt-in documentada por separado si se necesitan credenciales reales.
6. Actualice la matriz y la documentación de comandos.

## Cobertura

- Backend: `artifacts/coverage/backend-unit.out` y `backend-integration.out`.
- Frontend: `artifacts/coverage/frontend/`.
- Informe E2E: `artifacts/playwright-report/`.

## Depuración de pruebas fallidas

```bash
./terra logs api
./terra logs web
./terra shell api
./terra shell web
docker compose exec -T web npx vitest run tests/unit --reporter=verbose
docker compose exec -T api go test -tags=integration -v ./tests/integration/...
```

Ninguna prueba puede eliminar la base de datos de desarrollo ni el volumen de documentos.
