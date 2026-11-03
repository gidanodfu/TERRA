# Convenciones de API

## Base y formato

- Prefijo: `/api/v1`.
- JSON UTF-8 en peticiones y respuestas (`Content-Type: application/json`).
- Fechas ISO-8601 UTC (`2026-11-03T17:00:00Z`).
- Identificadores UUID v4.
- Sin CORS: el SPA y la API comparten origen a través del proxy de Vite.

## Autenticación

- Cookie de sesión `terra_session` (`HttpOnly`, `SameSite=Lax`; `Secure` solo si se sirve por HTTPS).
- Los métodos `POST`, `PATCH`, `DELETE` requieren `X-CSRF-Token` igual al token de la sesión,
  transportado además en la cookie legible `terra_csrf`.
- El login administrativo exige Turnstile válido y verifica el `Origin` cuando está presente.
- Google OAuth usa redirecciones del navegador; el callback emite la cookie de sesión.

## Errores

Forma estable:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Complete todos los campos obligatorios.",
    "fields": { "position_id": "Seleccione un cargo activo del área elegida." }
  },
  "request_id": "6e354b0576564a3c375958af"
}
```

Códigos HTTP usados: `200`, `201`, `202`, `302`, `400`, `401`, `403`, `404`, `409`, `422`,
`429`, `500`, `502`, `503`.

Códigos de aplicación relevantes:

| Código | Significado |
|---|---|
| `validation_error` | Campos inválidos; revisar `fields` |
| `unauthorized` | Sin sesión o sesión expirada |
| `forbidden` / `rate_limited` | Sin permiso / demasiados intentos |
| `drive_not_connected` | El trabajador no conectó Drive |
| `drive_reauthorization_required` | Token inválido o revocado |
| `policy_not_published` / `policy_consent_required` | Política no disponible o no aceptada |
| `capacity_active_jobs` / `capacity_*_storage` / `capacity_disk` | Límites de capacidad |
| `job_terminal` | El trabajo ya finalizó |
| `turnstile_failed` / `turnstile_unavailable` | Verificación de seguridad |
| `drive_account_mismatch` | La cuenta autorizada no coincide con la sesión |

`request_id` aparece también en la cabecera `X-Request-ID` y en los logs.

## Paginación

```
?page=1&page_size=20
```

Respuesta:

```json
{
  "data": [],
  "pagination": { "page": 1, "page_size": 20, "total": 42 }
}
```

`page_size` máximo: 100. Los endpoints administrativos aceptan filtros por estado, área, cargo,
trabajador, texto y fechas según el recurso (ver OpenAPI).

## Idempotencia

`POST /admin/users/{userId}/download-jobs` acepta `Idempotency-Key` (máx. 128 caracteres).
La restricción única es `(requested_by_user_id, idempotency_key)`. Una repetición devuelve el
trabajo original, `202` y `Idempotent-Replayed: true`, sin volver a descargar nada.

## Creación de trabajos

```json
{ "scope_type": "my_drive_full", "root_folder_ids": [] }
```

```json
{ "scope_type": "selected_folders", "root_folder_ids": ["id1", "id2"] }
```

- El backend obtiene la conexión desde el trabajador; **nunca** acepta `drive_connection_id`.
- Valida pertenencia de cada carpeta a Mi unidad de esa conexión.
- Normaliza raíces solapadas conservando solo la padre.
- Responde `202 Accepted` con `Location`.

## Autorización por recurso

- Trabajador: solo sus propios perfiles, conexión, trabajos y documentos (propietario o solicitante).
- Administrador: gestión y supervisión; acceso a documentos con auditoría.
- El rol de sistema decide; el cargo organizativo no otorga permisos.
- Ocultar un botón en el frontend no sustituye la comprobación del backend.

## SSE

```
GET /api/v1/download-jobs/{id}/events
Accept: text/event-stream
Last-Event-ID: 123
```

```
event: snapshot
data: {"id":"...","status":"downloading","completed_items":12,...}

id: 45
event: job.progress
data: {...}

event: done
data: {...}
```

- `snapshot` inicial y en cambios de contador/estado.
- `job.*` e `item.*` desde PostgreSQL con `id` monotónico.
- `done` cierra el stream cuando el estado es terminal.
- Comentarios `: keep-alive` cada 15 s.
- Si el cliente se desconecta, debe consultar REST y reconectar con `Last-Event-ID`.

## Descarga de documentos

`GET /files/{id}/content` responde siempre como adjunto:

```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="..."; filename*=UTF-8''...
Cache-Control: private, no-store
```

Soporta `Range` mediante `http.ServeContent`. No se expone ninguna ruta física.

## Límites de tasa

En memoria, por proceso API:

| Ámbito | Límite |
|---|---|
| Login por IP | 15 / 15 min |
| Login por identidad | 6 / 15 min |
| Operaciones administrativas (por usuario) | 240 / min |
| Creación de trabajos (por usuario) | 10 / min |
| Lectura de trabajos (por usuario) | 120 / min |
| Navegación de carpetas Drive (por usuario) | 120 / min |
| Lectura de documentos (por usuario) | 120 / min |

Un `429` no sustituye Turnstile ni la validación de credenciales. Con varias réplicas de API o
exposición directa, complementar con límites en el proxy/WAF.
