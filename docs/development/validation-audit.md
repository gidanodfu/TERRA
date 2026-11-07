# Auditoría de validaciones

Registro de la auditoría del backend y de los formularios. La columna **Pruebas**
indica la evidencia existente después de esta revisión. No se modificaron RBAC,
roles, scopes, flujos OAuth, snapshots, retención ni contratos de endpoints.

## Matriz de operaciones

| # | Formulario / operación | Ruta frontend | Endpoint | Handler | Service | Validaciones actuales | Brecha corregida | PostgreSQL | Pruebas |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Inicio de sesión administrativo | `/` · `LoginPage.jsx` | `POST /auth/admin/login` | `auth.Handler.AdminLogin` | `auth.Service.AdminLogin` | JSON estricto, `Origin`, Turnstile, rate limit por IP y usuario, credenciales, rol administrativo, estado activo | Ninguna crítica | username único, roles | `auth_admin_test.go`, `login-*.spec.js` |
| 2 | Cambio de contraseña | `/app/security` · `SecurityPage.jsx` | `POST /auth/password` | `auth.Handler.ChangePassword` | `auth.Service.ChangePassword` | Contraseña actual, mínimo 12, distinta de la actual, hash Argon2id, invalidación de otras sesiones, auditoría | Campos vacíos devuelven 422 con `fields` antes de consultar credenciales | credenciales y sesiones | `password_change_test.go`, `security-password.test.jsx` |
| 3 | Creación de cuenta administrativa | Trabajadores → Usuarios administrativos · `AdministrativeAccountsPanel.jsx` | `POST /admin/accounts` | `admin.Handler.CreateAdministrativeAccount` | `admin.Service.CreateAdministrativeAccount` | Rol permitido, nombres, límites de 100, username 3-64 con patrón, contraseña 12 y confirmación, permiso, auditoría | Ninguna; conflicto de username ya traducido a 409 | username único, roles, FK | `admin_accounts_test.go`, `administrative-accounts.test.jsx`, `validation_bypass_test.go` |
| 4 | Activación y desactivación | Trabajadores · `WorkersPanel.jsx` / `WorkerDetailPage.jsx` | `PATCH /admin/users/{id}`, `PATCH /admin/accounts/{id}` | `admin.Handler.UpdateUser`, `UpdateAdministrativeAccount` | `admin.Service` | Permiso, estado permitido, activo exige área/cargo, autosuspensión, administrador principal, invalidación de sesiones, auditoría | Ninguna | `CHECK` de estado, FK compuesta | `admin_accounts_test.go`, `validation_bypass_test.go` |
| 5 | Actualización organizativa de trabajador | `/app/admin/workers/:id` · `WorkerDetailPage.jsx` | `PATCH /admin/users/{id}` | `admin.Handler.UpdateUser` | `admin.Service.UpdateUser` | Área y cargo juntos, área activa, cargo del área, estado válido, permisos | Formulario ahora asocia `err.fields` y conserva datos | FK compuesta, historial | `validation_bypass_test.go`, `worker-detail-validation.test.jsx` |
| 6 | Actualización de perfil propio | Onboarding y Mi perfil · `ProfileForm.jsx` | `PATCH /me/profile` | `users.Handler.UpdateProfile` | `users.Service.UpdateOwnProfile` | Solo trabajadores, nombres obligatorios y máximo 100, área y cargo obligatorios, área activa, cargo del área | Sin cambios; ya asociaba `err.fields` | FK compuesta, `CHECK` | `profile-form.test.jsx`, `organization_test.go` |
| 7 | Creación de área | Áreas y cargos · `OrganizationPage.jsx` | `POST /admin/areas` | `organization.Handler.CreateArea` | `organization.Service.CreateArea` | Nombre obligatorio y máximo 120, responsabilidades, unicidad normalizada, slug único | Ninguna | nombre normalizado único, slug único | `organization_catalog_test.go`, `validation_bypass_test.go` |
| 8 | Edición de área | Áreas y cargos · `OrganizationPage.jsx` | `PATCH /admin/areas/{id}` | `organization.Handler.UpdateArea` | `organization.Service.UpdateArea` | Nombre y estado, responsabilidades, unicidad, área inactiva conserva nombre | Estado usa utilidad compartida `OneOf`; errores por campo se limpian al editar | nombre normalizado único | `organization_catalog_test.go`, `validation_bypass_test.go` |
| 9 | Creación de cargo | Áreas y cargos · `OrganizationPage.jsx` | `POST /admin/areas/{areaId}/positions` | `organization.Handler.CreatePosition` | `organization.Service.CreatePosition` | Nombre obligatorio y máximo 120, responsabilidades, área existente y activa, unicidad dentro del área | Ninguna | unicidad `(area_id, normalized_name)` | `organization_catalog_test.go` |
| 10 | Edición de cargo | Áreas y cargos · `OrganizationPage.jsx` | `PATCH /admin/positions/{id}` | `organization.Handler.UpdatePosition` | `organization.Service.UpdatePosition` | Nombre, estado y responsabilidades, unicidad dentro del área | Estado usa `OneOf`; errores por campo se limpian al editar | unicidad `(area_id, normalized_name)` | `organization_catalog_test.go` |
| 11 | Responsabilidades generales y específicas | Modales de área y cargo | Incluidas en 7-10 | `organization.Handler` | `organization.Service.cleanResponsibilities` | Máximo 20, máximo 300 caracteres, sin vacíos, sin duplicados normalizados | Ninguna | `text[] NOT NULL` | `organization_catalog_test.go` |
| 12 | Publicación de política | `/app/admin/policy` · `PolicyPage.jsx` | `POST /admin/policies` | `drive.Handler.PublishPolicy` | `drive.Service.CreatePolicy` | Versión y contenido obligatorios, versión única, auditoría | Versión limitada a 60 caracteres y validación estándar; formulario asocia `err.fields` | `NOT NULL`, versión única | `policy-validation.test.jsx`, `validation_bypass_test.go` |
| 13 | Aceptación de política | `/app/drive` · `DrivePage.jsx` | `POST /me/drive/consent` | `drive.Handler.AcceptPolicy` | `drive.Service.AcceptPolicy` | Sesión, cuenta activa, versión igual a la vigente, consentimiento, auditoría | Versión vacía ahora devuelve 422; antes producía 409 de versión no vigente | FK de conexión y usuario | `validation_bypass_test.go` |
| 14 | Conexión y desconexión de Drive | `/app/drive` · `DrivePage.jsx` | `POST /me/drive/connect`, `DELETE /me/drive/connection` | `drive.Handler.ConnectMine`, `DisconnectMine` | `drive.Service.StartConnect`, `CompleteConnect`, `Disconnect` | Cuenta activa, `state` de un solo uso, PKCE, identidad Google coincidente, scope concedido, cifrado del refresh token, revocación | Ninguna | conexión única por usuario y subject | `drive_browse_test.go`, `drive-explorer.spec.js` |
| 15 | Creación de trabajo de descarga | `/app/admin/downloads` · `DownloadWizardPage.jsx` | `POST /admin/users/{userId}/download-jobs` | `downloads.Handler.AdminCreate` | `downloads.Service.Create` | Permiso, `Idempotency-Key` ≤128, modalidad, selección mínima y compatible, pertenencia, normalización, trabajador activo, conexión, política, capacidad e idempotencia | Máximo 100 por lista antes de deduplicar; IDs no vacíos y ≤256 caracteres; errores por campo | `CHECK` de modalidad/estado, FK, unicidad de idempotencia | `selected_items_test.go`, `validation_bypass_test.go` |
| 16 | Selección de carpetas y archivos | `FolderPicker.jsx` | `GET /admin/users/{userId}/drive/folders`, `/drive/items` | `drive.Handler.AdminFolders`, `AdminItems` | `drive.Service.BrowseFolders`, `Browse` | Permiso, conexión vigente, política, `parentId`, `page_token`, tamaño de página ≤100, carpeta válida y perteneciente al árbol | Ninguna | metadatos de nodos | `drive_browse_test.go`, `drive-explorer.spec.js` |
| 17 | Filtros de trabajadores | Trabajadores · `WorkersPanel.jsx` | `GET /admin/users` | `admin.Handler.Users` | `admin.Service.Users` | Paginación acotada, UUID de área/cargo, búsqueda, estado, parámetros SQL | Sin cambios: es consulta; un estado desconocido devuelve lista vacía | índices de usuarios | `workers-separation.spec.js`, `admin_accounts_test.go` |
| 18 | Filtros de trabajos | Trabajos · `JobsPage.jsx` | `GET /admin/download-jobs` | `downloads.Handler.List` | `downloads.Service.List` | Paginación acotada, UUID y fechas `YYYY-MM-DD`, estado y alcance, restricción por usuario sin permiso | Sin cambios: es consulta | índices de trabajos | `queue_test.go`, E2E de trabajos |
| 19 | Filtros de auditoría | Auditoría · `AuditPage.jsx` | `GET /admin/audit-events` | `admin.Handler.AuditEvents` | `admin.Service.Audit` | Permiso, alcance resuelto en servidor, UUID de actor, fechas, paginación | Sin cambios | índices de auditoría | `audit_scope_test.go` |
| 20 | Navegación del explorador | `FolderPicker.jsx` | `GET /admin/users/{userId}/drive/folders`, `/drive/items` | `drive.Handler` | `drive.Service.prepareBrowse` | Igual que 16; solo lectura, sin efectos de escritura | Ninguna | metadatos de nodos | `drive_browse_test.go`, `drive-explorer.spec.js` |

## Brechas corregidas

1. `POST /auth/password` con campos vacíos ahora devuelve 422 con
   `current_password` o `new_password`, sin consultar credenciales ni ejecutar
   hashing.
2. `POST /me/drive/consent` con versión vacía ahora devuelve 422; antes llegaba
   al servicio y se interpretaba como versión no vigente (409).
3. `POST /admin/policies` valida versión obligatoria, máximo 60 caracteres y
   contenido obligatorio con el contrato estándar.
4. La creación de trabajos rechaza más de 100 carpetas o archivos e
   identificadores vacíos o de más de 256 caracteres antes de llamar a Google o
   a PostgreSQL.
5. Los formularios de trabajador, política y selección de descarga asocian
   `err.fields`; login, seguridad y organización limpian solo el error del campo
   modificado.

## Brechas aceptadas o pendientes

- Los filtros de consulta aceptan valores de estado desconocidos y devuelven una
  lista vacía. No son operaciones de escritura y no se impuso una enumeración
  nueva para no cambiar el contrato de lectura.
- El contenido de la política solo está limitado por el transporte de 1 MB. No
  existe un máximo de negocio definido en el código; inventarlo cambiaría el
  contrato.
- `RETENTION_DAYS` no tiene consumidor automático en el backend. La retención se
  aplica únicamente con `deploy/scripts/retention.sh --apply`.
- La verificación de Google del scope restringido depende de Google Cloud y no
  puede validarse en el entorno local.

## Reglas preservadas

- No se modificó la matriz RBAC ni los roles.
- No se ampliaron scopes OAuth.
- No se alteraron los flujos de login o conexión de Drive.
- No se cambiaron snapshots, idempotencia, límites de capacidad ni retención.
- Los conflictos reales conservan HTTP 409 con código estable.
- Las validaciones de escritura permanecen en los services y PostgreSQL sigue
  siendo la última garantía de integridad.
