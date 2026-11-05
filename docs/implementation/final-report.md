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
- Scripts de operación local, copias de seguridad y recuperación.
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
- `./terra test frontend unit`: 18 pruebas correctas.
- `./terra test frontend integration`: 8 pruebas correctas.
- `./terra test frontend`: lint, build y cobertura correctos.
- `./terra test e2e`: 37 pruebas Playwright correctas (layout admin, layout trabajador, matriz responsive, tablas, formularios, modal, textos largos, tema claro/oscuro, persistencia, textarea de política, footer legal, reset Turnstile, login, rutas legales, 404, Inter, OAuth, proxy, montaje React, Vite client, React Refresh, HMR).
- `./terra test all`: validación integrada correcta.
- Recuperación tras eliminar contenedores conservando volumen.
- Copia de seguridad local, verificación y restauración con marcador.

## 12. Integración continua

`.github/workflows/ci.yml` se ejecuta en push, PR y manualmente. Usa Docker, crea un
`.env` ficticio, valida, construye, inicializa y ejecuta `./terra test all`. Publica
artifacts y recopila registros en fallos. No despliega a ningún servidor.

## 13. Riesgos residuales

- Los contenedores de desarrollo no son una configuración productiva.
- Las pruebas E2E no cubren el consentimiento Google/Turnstile real.
- El adaptador de Drive no se probó contra archivos reales en esta ejecución.
- La pérdida de `TOKEN_ENCRYPTION_KEY` obliga a reconectar Drive.
- La CI remota debe verificarse en GitHub Actions.

## 14. Copias de seguridad locales

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

## 16. Rediseño del login

La pantalla `/` se reconstruyó como composición centrada de una columna: identidad
TERRA, tarjeta de autenticación con paneles independientes para trabajadores y
administración, textos informativos y tarjeta legal inferior. Se eliminó el bloque
verde lateral y se aplicó Inter local (400–700) a todo el frontend.

No se modificaron backend, OAuth, Turnstile, sesiones ni rutas funcionales existentes.
Se añadieron cuatro rutas legales públicas (`/politica-de-privacidad`,
`/terminos-y-condiciones`, `/aviso-legal`, `/politica-de-cookies`) con páginas
independientes, navegación y contenido marcado como pendiente de aprobación
institucional. No se inventó contenido legal ni se declaró una política vigente.

## 17. Layout administrativo

El panel administrativo usa dos superficies independientes: sidebar blanca de
210–232 px y workspace flexible, ambas con márgenes exteriores, bordes redondeados
de 22 px y sombra discreta. La cabecera queda dentro del workspace. En tablet se
mantiene la sidebar reducida; en móvil se usa el drawer existente.

Causa raíz corregida: el shell alternaba entre altura ligada al viewport en `md+` y
altura por contenido por debajo de `md`; en ese segundo caso el documento entero
scrolleaba y aparecía la barra del navegador. Además, el wrapper de la sidebar no
tenía `min-w-0`, por lo que los textos con `truncate` imponían un ancho de
`min-content` de ~334 px dentro de un panel de 210–232 px y se recortaban con
`overflow-hidden`. Ahora el shell usa `100dvh` en todos los anchos, el workspace es
`h-full min-h-0` y el único scroll es `admin-scroll` (`overflow-y: auto`), con la
barra visual oculta. El wrapper de la sidebar es `w-full min-w-0`. El `main` usa
`@container` y las cuadrículas `@sm`/`@4xl`, ajustándose al ancho del workspace.

### Causa raíz del problema 100 % / 125 %

El shell usaba `max-w-[1600px]`. En un monitor de 1920 px al 100 % quedaba centrado con
160 px de aire a cada lado; al 125 % el viewport CSS baja a 1536 px y el mismo límite no
se alcanza, por lo que el diseño se veía lleno. La diferencia no era de zoom sino de
ancho máximo: 1920 → 1600 px de shell, 1536 → 1504 px de shell.

Corrección: `max-w-[1920px]` (16 px de margen en 1920 px, tope solo en ultrapanorámicos)
y grids por container queries sobre `main`, que miden el workspace real. Se añadió
`clamp(210px,17vw,232px)` a la sidebar, `min-w-0` a inputs/selects, `wrap-anywhere` a
textos sin puntos de corte, `contain: layout` a `.table-wrap` (el ancho de la tabla se
propagaba al `documentElement` en Chromium) y modales de altura acotada con cuerpo
desplazable.

### Validación

Se probaron 22 anchos (320–2560 px), alturas de 500–1080 px y zoom equivalente a 200 %
(960×540): sin scroll horizontal global, sin scroll vertical del documento en admin,
todos los módulos admin y worker sin desbordamientos, tablas con scroll interno,
formularios estables, modales acotados y capturas comparativas 100/125/150/200 %.
Los E2E subieron a 22 y `./terra test all` y `./terra doctor` finalizaron correctamente.

## 18. Tema claro/oscuro y campo de política

El tema se centraliza en `ThemeContext` y `ThemeToggle`, con preferencia en
`localStorage`, lectura inicial de `prefers-color-scheme` y un script inline que evita
el parpadeo. El selector aparece junto a «Cerrar sesión» en las dos sidebars. Los
tokens semánticos y la reinterpretación de las escalas de color en `.dark` cubren
sidebar, workspace, tarjetas, tablas, formularios, modales, alertas, estados vacíos y
Turnstile. El tema oscuro se refinó a True Black: fondo `#000000`, sidebar `#050505`,
workspace `#080808`, tarjetas `#101010`, tablas/modales `#181818`, bordes `#262626` y
texto muted `#a3a3a3`. El borde de input `#5c5c5c` cumple contraste no textual 3:1.
Validado en todas las rutas admin y worker, sin superficies claras ni textos oscuros
olvidados.

El campo «Contenido aprobado» de Política ocupa el 100 % del ancho de la tarjeta,
coincide con «Identificador de versión», tiene borde de 1 px, radio de 12 px, altura
mínima de 192–208 px, `resize: vertical` y foco verde institucional. Se validó a 320,
390, 768, 1024 y 1440 px y en ambos temas.

## 19. Footer legal del inicio de sesión

El footer de información legal se mantiene como tarjeta independiente bajo el
formulario. El encabezado y el aviso institucional están centrados; los cuatro
enlaces se distribuyen en una cuadrícula 2×2 de columnas iguales y cada enlace queda
centrado en su celda. En 320 px la cuadrícula pasa a una columna mediante container
query, sin comprimir textos ni provocar scroll horizontal. Se validaron las cuatro
rutas legales y los estados hover/focus.

## 20. Homologación del panel del trabajador

`AppLayout` unifica el shell de administración y trabajador: fondo general, sidebar
flotante de 210–232 px, workspace independiente, separación por gap, radios de 22 px,
header interno de 64 px y scroll propio. El trabajador conserva su navegación de seis
módulos, permisos, contenido, tarjeta de usuario y theme toggle; solo cambia la
configuración de navegación y el título del header. Se añadieron los test IDs
`worker-sidebar`, `worker-workspace`, `worker-scroll` y `worker-drawer`. El documento
no scrollea: el workspace y el menú tienen desplazamiento independiente, el header
permanece fijo y el drawer móvil reutiliza la misma sidebar.

## 21. Reinicio de Turnstile tras error de autenticación

El fallo se debía al ciclo de vida del widget: tras un 401 el token anterior seguía
en React y el widget no se reiniciaba. `Turnstile` ahora expone `reset()` mediante
`forwardRef`/`useImperativeHandle`; el método limpia el token, valida que exista
`window.turnstile` y un `widgetId`, ejecuta `window.turnstile.reset(widgetId)` y
mantiene el widget montado. `LoginPage` limpia el token y llama a `reset()` en el
catch de cualquier intento enviado que falle (401, 429 o error de red); las
validaciones locales no reinician el widget. El backend sigue validando Siteverify,
acción, hostname, credenciales y límites antes de crear la sesión.

Pruebas:
- Vitest: render/reset/remove, expiración, error-callback y reset sin widget;
- RTL: 401 con token-1 → reset → token-2 → segundo intento correcto; tres fallos
  consecutivos con tokens distintos;
- Go integration: 401 sin sesión, rechazo Turnstile antes de contraseña, Siteverify
  no disponible, acción/hostname incorrectos y rate limit antes de Siteverify;
- E2E: token-1 → 401 → reset → token-2 → `/app/admin`, sin recargar.
