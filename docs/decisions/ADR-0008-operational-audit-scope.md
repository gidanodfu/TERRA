# ADR-0008 — Separación entre auditoría operacional y completa

Estado: aceptado.

## Contexto

El moderador gestiona trabajadores y necesita revisar la trazabilidad de sus operaciones.
El rol de solo lectura debe conservar la supervisión institucional completa. Un único
permiso `admin.audit.read` obligaba a elegir entre dar al moderador acceso a eventos de
seguridad y cuentas administrativas, o dejarlo sin auditoría.

## Decisión

Se mantienen dos capacidades independientes:

- `admin.audit.read` — auditoría institucional completa para `admin` y `read_only`.
- `admin.audit.operational.read` — auditoría operacional para `moderator`.

El endpoint `GET /api/v1/admin/audit-events` admite cualquiera de los dos permisos. El
backend determina el alcance desde `principal.Current()`; el cliente no puede elegirlo.

La allowlist operacional es explícita y vive en `backend/internal/audit`:

- `admin.user.updated`, solo con `metadata.kind=worker`;
- `user.profile.updated`;
- `drive.connected`;
- `drive.disconnected`;
- `download_job.created`;
- `download_job.cancel_requested`;
- `download_job.retried`;
- `policy.accepted`.

La consulta aplica la allowlist antes del COUNT y de la paginación. Los metadatos se sanean
con una lista de campos permitidos por acción. Nunca se devuelven IPHash, correos, claves de
idempotencia, secretos ni contenido documental.

## Consecuencias

- El moderador ve solo eventos relacionados con su responsabilidad operativa.
- Solo lectura y administrador mantienen la auditoría completa.
- Añadir un evento operacional requiere una decisión explícita en la allowlist.
- El Dashboard reutiliza la misma consulta y alcance que el módulo de Auditoría.
- No se requieren migraciones: RBAC se calcula desde los roles existentes.
