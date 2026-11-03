# Informe final de entrega — TERRA

Fecha: 2026-11-03. Alcance: MVP completo según la especificación funcional y arquitectónica.
No se declara producción OAuth verificada: las dependencias externas están en `blockers.md`.

## 1. Arquitectura implementada

Cuatro contenedores exactos:

```
web (React 19 + Vite 8 + Tailwind 4 + Nginx)
  └── /api y SSE → api (Go 1.27, REST)
                     ├── db (PostgreSQL 18, cola persistente)
                     └── worker (Go, leases + download pipeline)
                            └── volumen privado /var/lib/terra
```

- Backend modular por capacidad (auth, users, organization, drive, downloads, storage, admin, audit, platform).
- Worker independiente con `FOR UPDATE OF j SKIP LOCKED`, lease, heartbeat, recuperación e idempotencia.
- PostgreSQL como fuente de verdad; sin Redis/broker.
- Frontend por funcionalidades con rutas protegidas, SSE y fallback REST.
- Migraciones embebidas y bootstrap dentro del servicio `api`.

## 2. Funcionalidades completadas

- Login Google (OIDC) y login local con Argon2id, Turnstile, rate limiting, sesiones y CSRF.
- Onboarding obligatorio, áreas, cargos, estados e historial organizativo.
- OAuth Drive separado con `drive.readonly`, PKCE, state, `offline`, consentimiento y verificación de `sub`.
- Refresh tokens cifrados AES-256-GCM; estados de conexión y reconexión.
- Política institucional versionada aceptada solo por el trabajador.
- Drive API v3 real: paginación, papelera excluida, shortcuts, exportación y descarga binaria.
- Dos modos de descarga, normalización de raíces, snapshots independientes y carpetas vacías.
- Worker con concurrencia, limitador por cuenta, reintentos/backoff, cancelación y checksums.
- Almacenamiento seguro con sanitización, anti-symlink, `.part` y rename atómico.
- API de trabajos, items, SSE, documentos y acceso autorizado auditado.
- Paneles trabajador y administrador completos, responsive.
- Dashboard, historial, almacenamiento y auditoría.
- Backups/restauración/consistencia/retención documentados y automatizables.

## 3. Funcionalidades pendientes (externas)

- Consentimiento OAuth real con cuentas personales de prueba (redirect URIs + pantalla de consentimiento).
- Verificación de Google del scope restringido y posible evaluación de seguridad.
- Contenido legal aprobado de la política institucional.
- Aprobación de límites de capacidad de producción y ruta de backups.
- Ensayo de restauración en entorno institucional.
- Suite E2E de navegador versionada en CI (se ejecutó smoke manual con Playwright).

## 4. Estructura del repositorio

```
TERRA/
├── backend/
│   ├── cmd/{api,worker,bootstrap}/
│   ├── internal/{auth,users,organization,drive,downloads,storage,admin,audit,platform,server}/
│   ├── migrations/           # 0001..0004
│   └── Dockerfile
├── frontend/
│   ├── src/{app,pages,features,components,layouts,services,utils,styles}/
│   ├── nginx.conf
│   └── Dockerfile
├── deploy/{compose.yaml,compose.dev.yaml,compose.prod.yaml,scripts/}
├── docs/
├── .env.example
├── README.md
└── CONTRIBUTING.md
```

## 5. Servicios Docker

| Servicio | Imagen | Usuario | Volumen documental |
|---|---|---|---|
| web | Nginx + SPA | `nginx` | no |
| api | Go | 10001 (prod) | solo lectura |
| worker | Go | 10001 (prod) | lectura/escritura |
| db | PostgreSQL 18 | postgres | no |

Healthchecks, `read_only`, `tmpfs /tmp`, `no-new-privileges`, límites de memoria y red interna.
Desarrollo expone PostgreSQL solo en `127.0.0.1`; producción no lo expone.

## 6. Variables de configuración

Documentadas en `docs/operations/configuration.md` y `.env.example`. Incluyen aplicación,
PostgreSQL, Google, cifrado, Turnstile, almacenamiento, worker, límites y bootstrap.
Los secretos no se versionan ni se exponen con prefijo `VITE_`.

## 7. Inicio

```bash
mkdir -p data/dev/{staging,areas}
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml up -d --build
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml exec -T api /app/bootstrap
# http://localhost:8080
```

## 8. Bootstrap

`/app/bootstrap` valida configuración, aplica migraciones, prepara/verifica storage y crea el primer
administrador una sola vez. Reejecutarlo no sobrescribe credenciales. La contraseña inicial debe
rotarse en el primer acceso.

## 9. Migraciones

| Archivo | Contenido |
|---|---|
| `0001_init.sql` | esquema completo, restricciones, índices, roles |
| `0002_sessions_and_scan.sql` | checkpoint de escaneo, índice de espera, trigger de sesiones |
| `0003_drive_revision.sql` | revisión de Drive observada |
| `0004_job_org_slug_snapshot.sql` | slugs de área/cargo congelados en el trabajo |

Se aplican con advisory lock y transacción por archivo.

## 10. Pruebas realizadas y resultados

- `go test ./...`: 7 paquetes con pruebas, todos OK.
- `go vet ./...`: sin hallazgos.
- `npm run build`: OK (Vite 8, 2087 módulos).
- `docker compose config`: exactamente 4 servicios; override de producción válido.
- Integración real con Docker: migraciones, bootstrap, login admin, CSRF, Turnstile inválido,
  rate limit (7.º intento 429), creación de área/cargo/política, creación de trabajo 202,
  worker + lease, token inválido → `reauthorization_required` + `waiting_authorization`,
  idempotencia, SSE, cancelación, auditoría, listado no-admin, permisos 403 y snapshots de slugs.
- Smoke de interfaz headless: 10 rutas administrativas, menú móvil y sin errores de página.
- Se detectó y corrigió un bug de serialización en `/auth/me` y un placeholder SQL en el listado
  de trabajos para no administradores.

Detalle en `docs/testing/test-cases.md`.

## 11. Configuración OAuth pendiente

- Registrar redirect URIs exactas en Google Cloud.
- Pantalla de consentimiento External con scopes de login y `drive.readonly`.
- Usuarios de prueba mientras no exista verificación.
- Rotar `GOOGLE_CLIENT_SECRET` si el actual estuvo expuesto en canales informales.
- Configurar Turnstile del dominio real.

## 12. Requisitos de verificación de Google

- Justificación del scope restringido.
- Política de privacidad y términos públicos.
- Video/descripción del flujo si Google lo solicita.
- Evaluación de seguridad si aplica.
- No afirmar aprobación hasta recibirla.

## 13. Riesgos residuales

- Sin MFA para administradores locales.
- Rate limiting en memoria por réplica.
- Volumen no cifrado por la aplicación; depende del disco institucional.
- Sin antivirus/DLP ni previsualización aislada de archivos.
- Rotación de `TOKEN_ENCRYPTION_KEY` requiere re-cifrado manual.
- Verificación de Google y pruebas reales de Drive pendientes.
- Auditoría mutable por administradores de base de datos; exportar a almacenamiento inmutable si se
  requiere no repudio fuerte.

## 14. Backup y restauración

Scripts:

```bash
deploy/scripts/backup.sh              # BD + volumen + SHA256 (+ GPG opcional)
deploy/scripts/verify-backup.sh DIR   # integridad sin restaurar
CONFIRM=yes deploy/scripts/restore-db.sh DIR/terra.dump
CONFIRM=yes deploy/scripts/restore-storage.sh DIR/storage.tar.gz
deploy/scripts/consistency-check.sh
```

La recuperación exige coordinar PostgreSQL + volumen + `TOKEN_ENCRYPTION_KEY`. Sin la clave, los
refresh tokens son irrecuperables y los trabajadores deben reconectar Drive. Procedimiento completo
en `docs/operations/backup-restore.md`.
