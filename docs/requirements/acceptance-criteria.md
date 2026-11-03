# Criterios de aceptación

## Arquitectura

- [x] `docker compose config` reconoce exactamente `web`, `api`, `worker`, `db`.
- [x] API y worker usan la misma imagen con comandos distintos.
- [x] PostgreSQL no publica puertos en producción.
- [x] API monta documentos en solo lectura; worker en escritura; web/db no los montan.
- [x] Reiniciar el stack conserva la base y los documentos.
- [x] Migraciones y bootstrap se ejecutan dentro del servicio `api` existente.

## Identidad

- [ ] Un trabajador completa login Google y onboarding en navegador real (pendiente de redirect URIs).
- [x] Login administrativo emite sesión y cookies; CSRF es obligatorio.
- [x] Turnstile inválido es rechazado.
- [x] Rate limit responde 429 tras el límite.
- [x] El primer administrador se crea una vez; el bootstrap repetido no lo modifica.
- [x] Suspensión/desactivación invalida sesiones.
- [x] Un cargo de otra área o inactivo es rechazado.

## Drive

- [ ] Dos cuentas personales reales conectadas y árboles reconstruidos (requiere consentimiento real).
- [x] La URL de autorización de Drive solicita `drive.readonly`, `offline`, `consent`, PKCE y state.
- [x] La cuenta autorizada debe coincidir con el `sub` de Google del usuario.
- [x] Un refresh token inválido cambia la conexión a `reauthorization_required` y el trabajo a `waiting_authorization`.
- [x] El adaptador pagina con `nextPageToken` y excluye papelera.
- [x] Exportación nativa y descarga binaria implementadas.
- [x] Atajos no generan ciclos ni segunda copia.

## Descargas

- [x] Creación responde HTTP 202 y no descarga en la petición.
- [x] Un trabajo sobrevive al cierre del navegador.
- [x] El worker reclama con `SKIP LOCKED`, renueva lease y recupera trabajos vencidos.
- [x] Idempotency-Key repetida devuelve el mismo trabajo.
- [x] Cancelación funciona en cola y se propaga al worker.
- [x] Fallos parciales producen `partially_completed`; no se marca completado con pendientes.
- [ ] Prueba de reinicio a mitad de transferencia con Drive real (pendiente de cuenta).
- [x] Estructura original y carpetas vacías preservadas por diseño y pruebas de rutas.
- [x] Snapshots de trabajos distintos no comparten directorio.

## Almacenamiento

- [x] `../`, rutas absolutas, separadores inválidos y symlinks son rechazados por pruebas.
- [x] Colisiones de nombres se resuelven con sufijo determinista.
- [x] `.part` no se publica como archivo final.
- [x] SHA-256 se calcula y almacena; MD5 se compara cuando existe.
- [x] Acceso sin sesión devuelve 401; usuario ajeno devuelve 403.
- [x] Acceso administrativo a documento genera auditoría.

## Interfaz

- [x] Rutas del trabajador y del administrador separadas por rol.
- [x] Selector de carpetas con navegación, selección y advertencia de solapamiento.
- [x] Dashboard, historial, almacenamiento y auditoría funcionales.
- [x] SSE y fallback REST.
- [x] Estados loading/empty/error/partial/completed.
- [x] Layout responsive con menú móvil.
- [ ] Pruebas E2E automatizadas en navegador (recomendado, no implementado).

## Operación

- [x] Healthchecks para los cuatro servicios.
- [x] Un solo comando de inicialización (`init.sh dev`).
- [x] Scripts oficiales de check/build/init/up/down/restart/status/logs/migrate/bootstrap/test/backup/restore/help.
- [x] Ambientes dev/prod con archivos, proyectos, imágenes y volúmenes separados.
- [x] `down.sh` e `init.sh` conservan volúmenes y datos.
- [x] Recuperación tras eliminar los cuatro contenedores probada en desarrollo.
- [x] Primera instalación aislada probada con proyecto y almacenamiento propios.
- [x] Backup verificado y restauración ensayada con marcador.
- [x] Scripts validados con `bash -n` y ShellCheck.
- [x] Documentación operativa completa en `docs/operations/`.
- [ ] Restauración completa ensayada por la institución (requiere entorno productivo).
- [ ] Aprobación de límites y política institucional (externa).
