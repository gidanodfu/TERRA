# ADR-0007 — Consentimiento institucional versionado

Estado: aceptado.

## Contexto

El consentimiento OAuth de Google no equivale a la aceptación de la política municipal. TERRA no
debe inventar contenido legal ni permitir que un administrador acepte en nombre del trabajador.

## Decisión

- Tabla `policy_versions` con `version` única, contenido y fecha de publicación.
- Un administrador publica versiones aprobadas (`POST /admin/policies`).
- El trabajador acepta la versión vigente (`POST /me/drive/consent`).
- `drive_connections` guarda versión, fecha y usuario que aceptó.
- La exploración y la creación de trabajos se bloquean si:
  - no hay política publicada (`policy_not_published`);
  - la versión aceptada no es la vigente (`policy_consent_required`);
  - la conexión no está `connected`.
- Cambiar de versión obliga a un nuevo consentimiento.

## Consecuencias

- No se incluye texto legal ficticio en el repositorio.
- El flujo de UI muestra la política vigente y exige una acción personal.
- Las descargas ya en curso no se detienen retroactivamente por una nueva política; los nuevos
  trabajos sí se bloquean hasta aceptar la versión vigente. Esta decisión evita interrumpir
  transferencias legítimas y debe revisarse si la institución exige lo contrario.
- La política no puede eliminarse si hay conexiones que la referencian; se versiona, no se
  sobrescribe.
