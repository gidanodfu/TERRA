# Requisitos funcionales

Convención: `RF-xx` se referencia en pruebas y criterios de aceptación.

## Identidad y acceso

| ID | Requisito | Implementación |
|---|---|---|
| RF-01 | Trabajadores inician sesión con Google; identidad por `sub`. | `auth.CompleteLogin` |
| RF-02 | El correo debe estar verificado cuando se usa como contacto. | `auth.CompleteLogin` |
| RF-03 | Onboarding obligatorio: nombres, apellidos, área y cargo. | `/me/profile`, `ProfileForm` |
| RF-04 | Errores específicos por campo y cargo dependiente del área. | Validación backend + UI |
| RF-05 | Administradores usan credenciales locales con Argon2id y Turnstile. | `/auth/admin/login` |
| RF-06 | Rotación obligatoria de la contraseña inicial. | `must_rotate_password` |
| RF-07 | Sesiones server-side con cookie HttpOnly, Secure en producción y CSRF. | `sessions`, `RequireAuth` |
| RF-08 | Suspender/desactivar invalida sesiones y conserva historial. | Trigger PostgreSQL |
| RF-09 | Primer administrador por bootstrap idempotente de un solo uso. | `cmd/bootstrap` |

## Organización y autorización

| ID | Requisito | Implementación |
|---|---|---|
| RF-10 | CRUD lógico de áreas y cargos; no borrado físico de elementos asociados. | `organization` |
| RF-11 | Un cargo pertenece a un área; el cargo del usuario debe pertenecer a su área. | FK compuesta + validación |
| RF-12 | Cambios de área/cargo generan historial con fecha y actor. | `organization_history` |
| RF-13 | Roles de sistema `admin`/`user`, separados de los cargos. | `system_roles`, `user_roles` |
| RF-14 | Todos los permisos se verifican en backend. | `RequireAuth/Active/Admin` + checks por recurso |

## Google Drive

| ID | Requisito | Implementación |
|---|---|---|
| RF-15 | Login y autorización documental son procesos OAuth separados. | Dos flujos y redirect URIs |
| RF-16 | Solo `drive.readonly`; no `drive.file` ni escritura. | Configuración + verificación de scope |
| RF-17 | La cuenta Drive debe coincidir con el `sub` de la sesión. | `CompleteConnect` |
| RF-18 | Refresh tokens cifrados en servidor, nunca en el navegador. | AES-256-GCM |
| RF-19 | Estados de conexión `connected`, `reauthorization_required`, `revoked`, `error`. | `drive_connections.status` |
| RF-20 | Desconectar revoca el token y bloquea nuevos trabajos. | `DELETE /me/drive/connection` |
| RF-21 | Política institucional versionada aceptada personalmente por el trabajador. | `policy_versions`, `drive_connections` |
| RF-22 | Exploración paginada de Mi unidad, excluyendo papelera. | `API.ListChildren` |
| RF-23 | Selector administrativo de carpetas con validación de pertenencia. | `Browse`, `PathToRoot` |
| RF-24 | Atajos resueltos sin ciclos ni duplicación de contenido. | Referencia registrada, sin recorrido |
| RF-25 | Exportación Docs→DOCX, Sheets→XLSX, Slides→PPTX; Vids fuera del MVP. | `ExportMime`, `OpenDownload` |

## Descargas

| ID | Requisito | Implementación |
|---|---|---|
| RF-26 | Crear trabajo valida permisos, conexión, política, alcance y capacidad; responde 202. | `downloads.Create` |
| RF-27 | Modalidades: Mi unidad completa y carpetas seleccionadas. | `scope_type` |
| RF-28 | Normalizar raíces solapadas conservando solo la padre. | `NormalizeRoots` |
| RF-29 | Cola persistente en PostgreSQL con `SKIP LOCKED`. | `ClaimNext` |
| RF-30 | Lease, heartbeat y recuperación de trabajos abandonados. | `lease_expires_at`, worker |
| RF-31 | Idempotencia por `Idempotency-Key`. | Índice único + replay |
| RF-32 | Cancelación en cola, exploración, transferencia y reintento. | `cancel_requested`, context |
| RF-33 | Reintentos con backoff, jitter, `Retry-After` y máximo de intentos. | `handleItemError` |
| RF-34 | Limitación de inicio por cuenta compartida entre trabajos. | `AccountLimiter` |
| RF-35 | Estados de trabajo y elementos definidos en la especificación. | `domain.go` |
| RF-36 | Un trabajo no se marca completado con elementos incompletos. | Verificación final |
| RF-37 | Un error individual no detiene innecesariamente el trabajo. | Fallos por elemento + estado parcial |

## Almacenamiento

| ID | Requisito | Implementación |
|---|---|---|
| RF-38 | Clasificación área/cargo/trabajador/snapshot por IDs estables. | `storage.JobRoot` |
| RF-39 | Preservar la estructura original desde Mi unidad. | Segmentos + `Mi unidad` |
| RF-40 | Conservar carpetas vacías. | `EnsureDir` durante scan |
| RF-41 | No sobrescribir snapshots de otros trabajos. | Path con `job-<uuid>` |
| RF-42 | Sanitizar nombres, bloquear traversal, rutas absolutas, symlinks y nombres reservados. | `storage` + tests |
| RF-43 | Colisiones con sufijo determinista por ID de Drive. | `UniqueName` |
| RF-44 | Escritura `.part` + streaming + SHA-256 + rename atómico. | Worker |
| RF-45 | Documentos accesibles solo por API autenticada y auditada. | `/files/{id}/content` |

## Administración, progreso y auditoría

| ID | Requisito | Implementación |
|---|---|---|
| RF-46 | Dashboard con métricas operativas. | `/admin/dashboard` |
| RF-47 | Historial de trabajos con filtros y detalle. | `/download-jobs`, UI |
| RF-48 | SSE con snapshot y eventos; REST como fuente de verdad. | `/download-jobs/{id}/events` |
| RF-49 | Auditoría de operaciones sensibles sin secretos ni contenido. | `audit_events` |
| RF-50 | Panel del trabajador limitado a sus propios recursos. | Checks de propietario/solicitante |
