# Estrategia de pruebas

## Pirámide

1. **Unitarias** (rápidas, sin Docker): lógica pura, criptografía, sanitización, clasificación.
2. **Integración** (Docker + PostgreSQL): migraciones, cola, HTTP, sesiones, SSRF/path, estados.
3. **E2E manual/controlado** (navegador + Google real): consentimiento, descarga, reconexión.
4. **Seguridad**: autorización por recurso, CSRF, rate limit, traversal, Turnstile.

## Comandos

```bash
cd backend
go test ./...
go vet ./...

cd ../frontend
npm ci
npm run build

# Stack
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml up -d --build
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml ps
```

## Unitarias existentes

| Archivo | Cobertura |
|---|---|
| `internal/storage/storage_test.go` | sanitización, traversal, symlinks, colisiones, JobRoot, espacio libre |
| `internal/platform/crypto/crypto_test.go` | AES-GCM, manipulación, hash de token, longitud de clave |
| `internal/platform/password/password_test.go` | Argon2id, contraseña incorrecta, hash malformado, política |
| `internal/downloads/limiter_test.go` | espaciado por cuenta, cancelación por contexto, backoff |
| `internal/drive/domain_test.go` | exportación de MIME, Vids fuera de alcance, deduplicación |
| `internal/auth/turnstile_test.go` | éxito, token inválido, action/hostname, falta de configuración |
| `internal/platform/oauthstate/state_test.go` | separación de flujos |

## Integración con PostgreSQL

La cola y las transacciones se validan contra PostgreSQL real. Para pruebas automatizadas en CI se
recomienda:

- levantar `postgres:18-alpine` como servicio del job;
- aplicar `migrations/`;
- usar transacciones con rollback por prueba;
- **no** usar credenciales reales de Google.

## Dobles de Drive

El adaptador de Drive es la única frontera externa. Para pruebas automáticas:

- implementar un servidor HTTP falso que emule `files.list`, `files.get`, `files.export` y
  `files.get?alt=media`;
- inyectar `option.WithEndpoint`/`WithHTTPClient` en el cliente de Google;
- cubrir paginación, 429, 500, 401, 403, shortcuts, carpetas vacías y respuestas parciales.

No se incluyó un mock en producción. El worker usa el adaptador real.

## E2E con Google (manual controlado)

Requisitos: dos cuentas personales de prueba, proyecto OAuth en modo prueba, redirect URIs
registradas, Drive API habilitada.

Escenarios mínimos:

1. Login, onboarding y perfil.
2. Conectar Drive A y Drive B; verificar aislamiento.
3. Árbol con carpeta vacía, nombres repetidos, shortcut a archivo y a carpeta.
4. Docs/Sheets/Slides exportados.
5. Archivo no descargable omitido con razón.
6. Mi unidad completa y carpeta seleccionada (ruta preservada).
7. Cancelación durante descarga y reinicio del worker.
8. Revocación de acceso desde Google → `reauthorization_required`.
9. Reconexión → trabajo en espera se reanuda.
10. Verificar checksums y `stored_files`.

## Seguridad

- Login sin sesión, con sesión de otro usuario, con rol insuficiente.
- CSRF ausente/incorrecto.
- Turnstile inválido/reutilizado/acción/hostname.
- Rate limit por IP e identidad.
- `..`, rutas absolutas, symlinks y nombres reservados.
- ID de archivo ajeno → 403; ID inexistente → 404.
- Documento servido como attachment y sin rutas físicas.
- Confirmar que logs no contienen secretos.

## CI propuesto

```
lint + go vet → go test ./... → npm ci + npm run build
→ docker compose config
→ build de imágenes
→ integración PostgreSQL (opcional con servicio)
→ escaneo de imagen/dependencias
```

Las pruebas que dependen de credenciales reales no deben ejecutarse en CI público.
