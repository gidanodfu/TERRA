# Documentación de TERRA

Índice principal de la documentación. Cada afirmación funcional debe poder
contrastarse con el código actual; los contratos HTTP se mantienen únicamente en
[`docs/api/openapi.yaml`](api/openapi.yaml).

## Uso de TERRA

- [Introducción y primeros pasos](usage/getting-started.md)
- [Trabajadores](usage/workers.md)
- [Administradores](usage/administrators.md)
- [Moderadores](usage/moderators.md)
- [Solo lectura](usage/read-only.md)
- [Conexión individual de Google Drive](usage/google-drive.md)
- [Consulta de documentos y descargas](usage/documents-and-downloads.md)

## Integraciones externas

- [Google Cloud, OAuth 2.0 y Google Drive](integrations/google-cloud-drive-oauth.md)
- [Referencias oficiales](references/official-documentation.md)

## Desarrollo

- [Referencia canónica de comandos](development/commands-reference.md)
- [Estándar de validación de formularios](development/form-validation.md)
- [Auditoría de validaciones](development/validation-audit.md)
- [Entorno Docker](development/docker-environment.md)
- [Inicialización y recuperación](development/initialization.md)
- [Desarrollo backend](development/backend-development.md)
- [Desarrollo frontend](development/frontend-development.md)
- [Desarrollo del worker](development/worker-development.md)
- [Base de datos](development/database-development.md)
- [Pruebas](development/testing.md)
- [Integración continua](development/continuous-integration.md)
- [Depuración](development/debugging.md)
- [Solución de problemas](development/troubleshooting.md)
- [Copias de seguridad locales](development/local-backups.md)
- [Almacenamiento y volúmenes](development/storage-and-volumes.md)
- [Formatos de archivo](development/file-formats.md)

## Arquitectura

- [Visión general](architecture/overview.md)
- [Arquitectura del backend](architecture/backend-architecture.md)
- [Arquitectura del frontend](architecture/frontend-architecture.md)
- [Contenedores](architecture/container-architecture.md)
- [Diseño de base de datos](architecture/database-design.md)
- [Pipeline de descargas](architecture/download-pipeline.md)
- [Almacenamiento](architecture/storage-design.md)
- [Catálogo organizativo](architecture/organization-catalog.md)
- [ADR-0001: cuatro contenedores y cola PostgreSQL](decisions/ADR-0001-four-containers-postgres-queue.md)
- [ADR-0002: OAuth External y Drive de solo lectura](decisions/ADR-0002-oauth-external-drive-readonly.md)
- [ADR-0003: organización modular del backend](decisions/ADR-0003-backend-module-layout.md)
- [ADR-0004: rutas de snapshot y escrituras atómicas](decisions/ADR-0004-snapshot-paths-atomic-writes.md)
- [ADR-0005: atajos de Drive como referencias](decisions/ADR-0005-drive-shortcuts-as-references.md)
- [ADR-0006: sesiones de servidor y CSRF](decisions/ADR-0006-server-side-sessions-csrf.md)
- [ADR-0007: versionado de política y consentimiento](decisions/ADR-0007-policy-consent-versioning.md)
- [ADR-0008: alcance de auditoría operacional](decisions/ADR-0008-operational-audit-scope.md)

## Seguridad

- [Autenticación](security/authentication.md)
- [Autorización y RBAC](security/authorization.md)
- [OAuth de Google Drive](security/oauth-drive.md)
- [Gestión de tokens](security/token-management.md)
- [Modelo de amenazas](security/threat-model.md)

## API

- [Contrato OpenAPI](api/openapi.yaml)
- [Convenciones de la API](api/api-conventions.md)

## Requisitos y planificación

- [Requisitos funcionales](requirements/functional-requirements.md)
- [Requisitos no funcionales](requirements/non-functional-requirements.md)
- [Criterios de aceptación](requirements/acceptance-criteria.md)
- [Plan de implementación](implementation/PLAN.md)
- [Progreso](implementation/progress.md)
- [Bloqueos](implementation/blockers.md)
- [Informe final](implementation/final-report.md)

## Regla de mantenimiento

1. Los comandos se documentan una sola vez en
   [`development/commands-reference.md`](development/commands-reference.md).
2. Los contratos de endpoints viven en [`api/openapi.yaml`](api/openapi.yaml).
3. Todo formulario nuevo debe seguir
   [`development/form-validation.md`](development/form-validation.md).
4. Al crear o mover un documento, actualice este índice y los enlaces relativos.
