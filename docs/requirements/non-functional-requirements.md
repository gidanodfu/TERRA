# Requisitos no funcionales

| ID | Categoría | Requisito | Evidencia |
|---|---|---|---|
| RNF-01 | Arquitectura | Exactamente cuatro contenedores de ejecución. | `deploy/compose.yaml` |
| RNF-02 | Arquitectura | API y worker separados, sin descargas en peticiones HTTP. | `cmd/api`, `cmd/worker` |
| RNF-03 | Persistencia | PostgreSQL es la fuente de verdad; cola persistente sin broker. | `download_jobs`, `SKIP LOCKED` |
| RNF-04 | Integridad | Restricciones, FKs e índices para reglas de negocio. | `migrations/0001` |
| RNF-05 | Seguridad | Refresh tokens cifrados; secretos fuera de logs y frontend. | AES-GCM, revisión de logs |
| RNF-06 | Seguridad | Cookies HttpOnly, CSRF, Turnstile, rate limiting. | middleware + Siteverify |
| RNF-07 | Seguridad | Validación de entrada y errores estables sin filtrar internals. | `apperr`, `httpx.Decode` |
| RNF-08 | Almacenamiento | Rutas contenidas, sin traversal ni symlinks. | tests de storage |
| RNF-09 | Recuperación | Worker reiniciable recupera leases vencidas. | `ClaimNext`, heartbeat |
| RNF-10 | Idempotencia | Reintentos de navegador no duplican trabajos. | clave única |
| RNF-11 | Rendimiento | Streaming y escritura por bloques; sin cargar archivos completos en memoria. | `io.CopyBuffer` |
| RNF-12 | Cuotas | Limitación compartida por cuenta y control de 429. | `AccountLimiter` |
| RNF-13 | Capacidad | Límites configurables por archivo, trabajo, usuario, área y disco. | `config.Limits` |
| RNF-14 | Observabilidad | Logs estructurados con `request_id`, `job_id`, `service`. | `logx`, `httpx.Logger` |
| RNF-15 | Operación | Configuración por entorno y fail-fast en producción. | `config.Load` |
| RNF-16 | Portabilidad | Sin instalaciones locales de Go/Node/PostgreSQL para ejecutar. | imágenes multi-stage |
| RNF-17 | Seguridad de contenedores | Usuario no root, read-only, límites y healthchecks. | compose + Dockerfiles |
| RNF-18 | UI | Responsive, accesible, estados completos y focus visible. | Tailwind + componentes |
| RNF-19 | Localización | Interfaz y mensajes de error en español. | frontend/backend |
| RNF-20 | Mantenibilidad | Módulos por capacidad, sin lógica de negocio en handlers. | estructura backend |
| RNF-21 | Documentación | Arquitectura, API, seguridad, operación y pruebas sincronizadas. | `docs/` |
| RNF-22 | Privacidad | Auditoría sin tokens, contraseñas, cookies ni contenido documental. | `audit` |
| RNF-23 | Recuperación | Backups coordinados de BD, volumen y clave separada. | scripts + doc |
| RNF-24 | Escalabilidad | Un worker puede procesar elementos con goroutines bajo límites. | worker |
| RNF-25 | Compatibilidad | PostgreSQL 18, navegadores modernos con SSE. | versiones fijadas |

## Supuestos

- El volumen documental está en un sistema de archivos local al contenedor worker (rename atómico).
- El proxy web es el único punto de entrada HTTP.
- La institución proporciona TLS en producción (terminación en el host o proxy institucional).
- Los límites definitivos y textos legales son decisiones administrativas.
