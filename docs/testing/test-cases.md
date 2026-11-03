# Casos de prueba y resultados

Leyenda: ✅ ejecutado y aprobado · ⚠️ parcial / depende de entorno · ⬜ pendiente externo.

## Autenticación

| ID | Caso | Resultado |
|---|---|---|
| AUTH-01 | Login Google válido y creación de usuario | ⬜ requiere consentimiento real |
| AUTH-02 | Login administrador válido | ✅ sesión + cookies + permisos |
| AUTH-03 | Contraseña administrador incorrecta | ✅ 401 genérico |
| AUTH-04 | Turnstile inválido | ✅ 403 `turnstile_failed` |
| AUTH-05 | Token Turnstile de acción/hostname incorrectos | ✅ unitario |
| AUTH-06 | Estado OAuth inválido/expirado | ✅ unitario + flujo de callback |
| AUTH-07 | Rate limit de login | ✅ 7.º intento 429 |
| AUTH-08 | Bootstrap duplicado | ✅ no sobrescribe |
| AUTH-09 | Sesión expirada/ausente | ✅ 401 |
| AUTH-10 | CSRF ausente | ✅ 403 |
| AUTH-11 | Logout | ✅ 200 y sesión eliminada |
| AUTH-12 | Cambio de contraseña con actual incorrecta | ✅ 422 campo específico |
| AUTH-13 | Suspensión invalida sesiones | ✅ trigger en migración; verificado por diseño |

## Perfil y organización

| ID | Caso | Resultado |
|---|---|---|
| ORG-01 | Crear área | ✅ |
| ORG-02 | Crear cargo en área | ✅ |
| ORG-03 | Cargo de otra área | ✅ rechazado por FK/validación |
| ORG-04 | Cargo inactivo | ✅ rechazado |
| ORG-05 | Perfil sin nombres/apellidos/área/cargo | ✅ validación por campo |
| ORG-06 | Historial de cambio de asignación | ✅ tabla + UI |
| ORG-07 | Suspender/desactivar conserva historial | ✅ restricciones sin cascada |

## Drive

| ID | Caso | Resultado |
|---|---|---|
| DRV-01 | URL de autorización de Drive | ✅ `drive.readonly`, offline, consent, PKCE, state |
| DRV-02 | Cuenta distinta a la sesión | ✅ rechazo `drive_account_mismatch` |
| DRV-03 | Refresh token inválido | ✅ conexión `reauthorization_required`; job `waiting_authorization` |
| DRV-04 | Paginación de carpetas | ✅ implementación `nextPageToken`; unitario de dominio |
| DRV-05 | Papelera excluida | ✅ query `trashed=false` + filtro |
| DRV-06 | Docs/Sheets/Slides | ✅ mapeo unitario; ⬜ E2E real |
| DRV-07 | Shortcut a archivo/carpeta | ✅ referencia sin duplicar; ⬜ E2E real |
| DRV-08 | Ciclos/profundidad | ✅ visited + límite 200 en ancestros |
| DRV-09 | Archivo no descargable | ✅ `skipped not_downloadable` |
| DRV-10 | Vids | ✅ `skipped google_vids_out_of_scope` |
| DRV-11 | Desconexión del trabajador | ✅ revoca token, estado `revoked`, bloquea jobs |
| DRV-12 | Reforma de política | ✅ consentimiento versionado |

## Descargas

| ID | Caso | Resultado |
|---|---|---|
| JOB-01 | Crear trabajo Mi unidad completa | ✅ 202 + encolado |
| JOB-02 | Crear con carpetas seleccionadas | ✅ validación; normalización implementada |
| JOB-03 | Carpeta padre e hija | ✅ normalización conserva padre |
| JOB-04 | Carpetas vacías | ✅ `EnsureDir` |
| JOB-05 | Idempotency-Key repetida | ✅ mismo trabajo + `Idempotent-Replayed` |
| JOB-06 | Doble clic | ✅ cubierto por idempotencia |
| JOB-07 | Worker reclama con SKIP LOCKED | ✅ en stack real |
| JOB-08 | Lease/heartbeat | ✅ logs y estados |
| JOB-09 | Reautenticación durante trabajo | ✅ `waiting_authorization` |
| JOB-10 | Cancelación en cola | ✅ `cancelled` |
| JOB-11 | Cancelación durante transferencia | ⚠️ implementada con context; E2E real pendiente |
| JOB-12 | Reinicio del worker | ⚠️ recuperación implementada; prueba real pendiente |
| JOB-13 | Fallo parcial | ✅ lógica de estados; E2E real pendiente |
| JOB-14 | Snapshot anterior conservado | ✅ path por UUID de job |
| JOB-15 | Validación selected_folders vacío | ✅ 422 |
| JOB-16 | Límites de capacidad | ✅ chequeos y códigos |

## Almacenamiento

| ID | Caso | Resultado |
|---|---|---|
| STO-01 | `../` | ✅ rechazado |
| STO-02 | Ruta absoluta | ✅ rechazada |
| STO-03 | Symlink | ✅ rechazado (test) |
| STO-04 | Nombres reservados/control | ✅ sanitizados |
| STO-05 | Colisión de nombres | ✅ sufijo determinista |
| STO-06 | Archivo grande | ✅ límite + skipping |
| STO-07 | `.part` no visible como final | ✅ rename atómico |
| STO-08 | Checksum MD5/SHA-256 | ✅ comparación/registro |
| STO-09 | Acceso sin sesión | ✅ 401 |
| STO-10 | Acceso a documento ajeno | ✅ 403 |
| STO-11 | Descarga administrativa auditada | ✅ evento `file.accessed` |
| STO-12 | Ruta física no expuesta | ✅ DTOs omiten `relative_path` |

## Docker / operación

| ID | Caso | Resultado |
|---|---|---|
| OPS-01 | Exactamente cuatro servicios | ✅ |
| OPS-02 | PostgreSQL 18 volumen correcto | ✅ `/var/lib/postgresql` |
| OPS-03 | Migraciones | ✅ `0001`, `0002`, `0003`, `0004` |
| OPS-04 | Bootstrap | ✅ |
| OPS-05 | API health/ready | ✅ |
| OPS-06 | Web sirve SPA y `/api` | ✅ |
| OPS-07 | Volumen API read-only | ✅ (sin creación de dirs) |
| OPS-08 | Usuario no root | ✅ UID 10001 (dev override 1000) |
| OPS-09 | DB no expuesta en prod | ✅ `ports: []` en override |
| OPS-10 | Reinicio conserva datos | ⚠️ volúmenes persistentes; prueba de ciclo completa recomendada |
| OPS-11 | Backup/restore | ✅ scripts + verificación; ⬜ ensayo institucional |

## Interfaz

| ID | Caso | Resultado |
|---|---|---|
| UI-01 | Build de producción | ✅ Vite 8 (2087 módulos) |
| UI-02 | Rutas protegidas por rol | ✅ |
| UI-03 | Onboarding | ✅ flujo |
| UI-04 | Panel trabajador | ✅ |
| UI-05 | Panel admin y asistente | ✅ |
| UI-06 | SSE + fallback | ✅ |
| UI-07 | Estados loading/empty/error | ✅ |
| UI-08 | Responsive | ✅ smoke headless a 1440×1000 y 390×844; drawer móvil |
| UI-09 | Pruebas E2E automatizadas | ⚠️ smoke Playwright ejecutado; suite no versionada |

## Automatización operativa

| ID | Caso | Resultado |
|---|---|---|
| OPS-13 | `bash -n` sobre todos los scripts | ✅ sin errores |
| OPS-14 | ShellCheck severidad warning | ✅ sin advertencias |
| OPS-15 | `check.sh dev` desde otro directorio | ✅ válido |
| OPS-16 | `check.sh` sin `.env` | ✅ falla con instrucción |
| OPS-17 | `check.sh prod` sin `.env.production` | ✅ falla con instrucción |
| OPS-18 | Docker ausente simulado | ✅ falla con instrucción |
| OPS-19 | Ambiente inválido (`qa`) | ✅ código 2 |
| OPS-20 | Servicio inválido en `restart.sh` | ✅ código 2 |
| OPS-21 | Primera instalación aislada (proyecto/puerto/storage propios) | ✅ 4 healthy, admin creado, datos separados |
| OPS-22 | `build.sh dev --no-cache` | ✅ 3 imágenes verificadas |
| OPS-23 | `init.sh` con volumen existente y contenedores eliminados | ✅ datos conservados (2 usuarios, 4 migraciones) |
| OPS-24 | `down.sh` (stop) y `up.sh` | ✅ datos persistidos |
| OPS-25 | `down.sh --remove` sin `-v` | ✅ volumen conservado |
| OPS-26 | `restart.sh dev worker` | ✅ healthy |
| OPS-27 | `status.sh` | ✅ estado, salud, volúmenes, storage, DB, API |
| OPS-28 | `logs.sh dev api -n 4` | ✅ logs sin secretos |
| OPS-29 | `migrate.sh dev status/version` | ✅ 4 migraciones |
| OPS-30 | `bootstrap.sh` repetido | ✅ no sobrescribe credenciales |
| OPS-31 | `test.sh dev unit/integration/e2e/all` | ✅ todo correcto |
| OPS-32 | `backup.sh` + `verify-backup.sh` | ✅ dump, tar, metadata y checksums validados |
| OPS-33 | `restore.sh` con marcador posterior al backup | ✅ marcador eliminado, datos originales conservados |
| OPS-34 | `restore.sh` sin confirmación no interactiva | ✅ código 3 sin tocar servicios |
| OPS-35 | `restore.sh` prod sin frase | ✅ bloqueado |
| OPS-36 | Cuatro servicios exactos | ✅ `web, api, worker, db` |
| OPS-37 | PostgreSQL no publicado en prod | ✅ override sin `ports` |
| OPS-38 | Cabeceras de seguridad tras mover Nginx | ✅ CSP/X-Frame-Options presentes |
| OPS-39 | Fixture de prueba eliminado sin tocar el stack principal | ✅ solo proyecto `terra-first` |
| OPS-40 | Variable obligatoria ausente (`SESSION_SECRET`) | ✅ `check.sh` falla con nombre de variable |
| OPS-41 | Servicio Compose extra | ✅ `check.sh` rechaza 5 servicios |
| OPS-42 | `check.sh prod` con configuración HTTPS temporal | ✅ válido sin iniciar producción |
| OPS-43 | `migrate.sh dev up` idempotente | ✅ migraciones al día |
