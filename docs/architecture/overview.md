# Arquitectura general

TERRA separa cuatro responsabilidades en cuatro contenedores. La API nunca descarga documentos
masivamente y el worker nunca sirve HTTP.

```mermaid
flowchart LR
    U[Trabajador / Administrador] -->|HTTP local| W[web<br/>React + Vite]
    W -->|/api REST| A[api<br/>Go]
    W -->|/api SSE| A
    A <-->|SQL| D[(db<br/>PostgreSQL)]
    K[worker<br/>Go] <-->|SQL, leases, cola| D
    K -->|Drive API v3| G[Google Drive]
    K -->|escritura atómica| V[(volumen privado)]
    A -->|lectura autorizada| V
    A -->|OAuth / Siteverify| X[Google OAuth / Cloudflare]
```

## Principios

1. **PostgreSQL es la fuente de verdad.** El estado de un trabajo no vive en memoria ni en el navegador.
2. **Asincronía real.** `POST` de creación solo valida y encola; responde `202`.
3. **Identidad separada de autorización documental.** El login usa OIDC; el acceso al Drive usa un segundo consentimiento OAuth con `drive.readonly`.
4. **El administrador no suplanta al trabajador.** La conexión pertenece al trabajador y su `sub` se compara con la sesión.
5. **Estructura original preservada.** La clasificación municipal es una capa de directorios; debajo se reproduce Mi unidad.
6. **Escritura atómica y trazable.** `.part` → validación → `rename` → PostgreSQL.
7. **UI sin autoridad final.** Oculta acciones por permisos, pero el backend decide.

## Módulos backend

| Módulo | Responsabilidad |
|---|---|
| `auth` | OAuth de identidad, login local, sesiones, CSRF, Turnstile, RBAC, middleware |
| `users` | Perfil, estados y asignación vigente |
| `organization` | Áreas, cargos, historial organizativo |
| `drive` | OAuth Drive, conexión, metadatos, carpetas, exportación/descarga |
| `downloads` | Cola, trabajos, worker, SSE, documentos y acceso a archivos |
| `storage` | Rutas relativas, sanitización, contención, `.part`, rename, espacio libre |
| `admin` | Dashboard, trabajadores y auditoría administrativa |
| `audit` | Registro de operaciones sensibles |
| `platform` | Config, DB, errores, HTTP, cifrado, password, rate limit, migraciones |
| `server` | Cableado de rutas y límites de autorización |

## Flujo de un snapshot

```mermaid
sequenceDiagram
    actor Admin
    participant Web
    participant API
    participant DB
    participant Worker
    participant Drive
    participant FS as Volumen privado

    Admin->>Web: Selecciona trabajador y alcance
    Web->>API: POST /admin/users/{id}/download-jobs
    API->>DB: Valida conexión, política, capacidad
    API->>DB: INSERT job (queued) + roots
    API-->>Web: 202 Accepted + job_id
    Web->>API: GET /download-jobs/{id}/events (SSE)
    Worker->>DB: SELECT ... FOR UPDATE SKIP LOCKED
    Worker->>DB: lease + heartbeat
    Worker->>Drive: files.list (paginado)
    Worker->>DB: drive_nodes, items, contadores
    Worker->>Drive: files.get alt=media / files.export
    Worker->>FS: .part + SHA-256 + rename
    Worker->>DB: item completed + stored_files
    API->>DB: lee estado/eventos
    API-->>Web: snapshot / progreso / done
```

## Decisiones que no se negocian

- Cuatro contenedores exactos.
- Sin Redis/RabbitMQ.
- Sin `drive.file` como sustituto de `drive.readonly`.
- Sin refresh tokens en el navegador.
- Sin borrado de historial al suspender/desactivar.
- Sin claves ni tokens en logs.
- Sin descargas dentro de una petición HTTP.

Véanse los ADR en `docs/decisions/`.
