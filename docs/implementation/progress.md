# Progreso de implementación

Actualizado: 2026-11-03.

## Implementado

### Backend

- API Go modular con módulos `auth`, `users`, `organization`, `drive`, `downloads`, `storage`, `admin`, `audit` y `platform`.
- Worker independiente (`cmd/worker`) con cola PostgreSQL, leases, heartbeat y recuperación.
- Bootstrap idempotente (`cmd/bootstrap`).
- Migraciones embebidas (4 archivos) con lock de asesoría.
- Autenticación Google (OAuth/OIDC), login local Argon2id, Turnstile, sesiones y CSRF.
- RBAC `admin`/`user`; cargos organizativos sin permisos de sistema.
- OAuth Drive separado, refresh token cifrado, estados de conexión y consentimiento institucional.
- Drive API v3 real: metadatos, paginación, carpetas, shortcuts, exportación y descarga.
- Cola persistente con idempotencia, normalización de raíces, cancelación y reintentos.
- Almacenamiento privado con sanitización por segmento, contención, anti-symlink y rename atómico.
- SSE con snapshot/eventos y fallback REST.
- Auditoría de operaciones sensibles y acceso administrativo a documentos.

### Frontend

- SPA React con rutas protegidas por sesión y rol.
- Panel trabajador: inicio, perfil/onboarding, Drive + política, descargas, documentos, seguridad.
- Panel administrativo: dashboard, trabajadores, organización, conexiones, asistente de descarga, trabajos, almacenamiento, auditoría y política.
- Selector de carpetas con navegación, selección múltiple y advertencia de solapamiento.
- Visualización de progreso por SSE y polling.
- Estados loading/empty/error/partial y diseño responsive.

### Infraestructura

- Cuatro servicios: `web`, `api`, `worker`, `db`.
- Nginx integrado en `web`, SSE sin buffering, CSP y cabeceras de seguridad.
- Contenedores no root; API con volumen documental de solo lectura; worker con escritura.
- PostgreSQL sin puerto publicado en producción; API/worker solo en la red Docker.
- Healthchecks y límites de recursos.
- Scripts de backup/restauración/consistencia/retención.

## Pruebas ejecutadas y resultados reales

### Automatizadas

```text
go test ./...
ok  terra/internal/auth
ok  terra/internal/downloads
ok  terra/internal/drive
ok  terra/internal/platform/crypto
ok  terra/internal/platform/oauthstate
ok  terra/internal/platform/password
ok  terra/internal/storage
```

También `go vet ./...` sin hallazgos y `npm run build` exitoso (Vite 8, 2087 módulos).

### Integración manual (stack Docker real)

| Prueba | Resultado |
|---|---|
| `docker compose config` con 4 servicios | OK |
| Migraciones al iniciar API/worker | OK (`0001`, `0002`, `0003`, `0004`) |
| Bootstrap idempotente crea administrador | OK |
| Login administrativo + cookies + CSRF | OK |
| POST sin `X-CSRF-Token` rechazado (403) | OK |
| Creación de área, cargo y política | OK |
| Login con Turnstile inválido rechazado (403) | OK |
| Rate limit de login: 7.º intento → 429 | OK |
| Google OAuth start: `client_id`, redirect URI, PKCE, state, scopes | OK |
| Creación de trabajo administrativo → HTTP 202 | OK |
| Worker reclama trabajo y renueva lease | OK |
| Refresh token inválido → conexión `reauthorization_required`, trabajo `waiting_authorization` | OK |
| Idempotency-Key repetida → mismo job, header `Idempotent-Replayed` | OK |
| Validación `selected_folders` vacío → 422 | OK |
| SSE entrega snapshot + eventos y mantiene conexión | OK |
| Dashboard, auditoría y changelog de eventos | OK |
| Contraseña actual incorrecta → 422 con campo específico | OK |
| Logout invalida sesión | OK |

La prueba de login con Turnstile se realizó temporalmente con claves de prueba oficiales de
Cloudflare y un arnés local; después se restauraron las claves reales del `.env`, se reconstruyó
la API y se verificó que un token inválido vuelve a ser rechazado. No se conservó ningún bypass.

### Smoke de interfaz en navegador (Playwright headless)

- Se creó una sesión de administrador de prueba directamente en PostgreSQL y se recorrieron
  `/app/admin`, trabajadores, organización, conexiones, descargas, trabajos, almacenamiento,
  auditoría, política y seguridad.
- Todos los encabezados esperados renderizaron; no hubo errores de página.
- Se verificó el menú móvil (390×844) y el drawer de navegación.
- El smoke detectó un bug real: `/auth/me` devolvía `principal.Identity` con claves JSON en
  mayúsculas (`ID`, `Roles`), por lo que el SPA no reconocía el rol. Se corrigió para devolver el
  `User` completo desde el repositorio y se revalidó el recorrido.
- La sesión y el estado de prueba se eliminaron; `must_rotate_password` se restauró a `true`.
- El script E2E no se versionó; se recomienda incorporarlo con Playwright en CI.

## Limitaciones conocidas

- No se completó un consentimiento OAuth real en navegador con una cuenta personal porque el
  cliente de desarrollo aún debe registrar los redirect URIs exactos y la pantalla de
  consentimiento debe habilitar los scopes. Ver `blockers.md`.
- La verificación de Google para scope restringido no está realizada. **TERRA no está verificada
  por Google.**
- Las pruebas de descarga E2E con archivos reales (Docs/Sheets/Slides, shortcuts, árbol profundo)
  requieren una cuenta de prueba autorizada; el adaptador implementa los endpoints oficiales y
  está cubierto por pruebas unitarias de clasificación, pero no se ejecutó contra Drive real.
- La retención es un script operativo explícito, no un borrado automático, para evitar pérdida
  silenciosa de snapshots.
- El frontend no tiene suite E2E automatizada versionada; se ejecutó un smoke headless descrito
  arriba y se verificó la compilación. Se recomienda añadir Playwright con un usuario semilla a CI.
