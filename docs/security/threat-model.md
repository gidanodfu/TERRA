# Modelo de amenazas

Activos: documentos de trabajadores, refresh tokens de Google, credenciales administrativas,
sesiones, historial/auditoría, integridad de snapshots.

## STRIDE

| Amenaza | Escenario | Control implementado | Residual |
|---|---|---|---|
| **Spoofing** | Robo de sesión o login CSRF | Cookie HttpOnly + SameSite=Lax + CSRF token + state OAuth de un solo uso + PKCE | XSS en el origen podría actuar en nombre del usuario |
| **Spoofing** | Conectar una cuenta Google ajena | Comparación `sub` de Drive con identidad de sesión; una conexión por usuario; `UNIQUE(google_subject)` | Requiere que el trabajador no comparta su sesión |
| **Spoofing** | Bypass de Turnstile | Siteverify servidor, acción y hostname, rate limit, fallo cerrado | Usar claves del widget local correcto |
| **Tampering** | Modificar documentos en disco | Volumen privado, permisos, rutas por UUID, checksums, rename atómico | Un administrador del host puede modificarlos; se recomienda monitoreo de integridad |
| **Tampering** | Alterar el estado de un trabajo | PostgreSQL como fuente de verdad; transiciones en servicio; lease | Acceso directo a la BD por administradores de infraestructura |
| **Repudiation** | Negar una descarga/consulta | Auditoría de creación, cancelación, conexión, política y acceso administrativo | La retención de registros/BD depende de la operación |
| **Information disclosure** | IDOR a documentos de otro trabajador | Verificación de propietario/solicitante en cada recurso | Un admin puede acceder conforme a política; queda auditado |
| **Information disclosure** | Fuga de refresh token | AES-256-GCM, nunca al frontend/logs, clave externa | Compromiso del host o de la clave |
| **Information disclosure** | Path traversal/symlink | Sanitización por segmento, rechazo de `..`/absolutas, `Lstat`, `O_NOFOLLOW`, contención | Bugs futuros deben cubrirse con tests |
| **Denial of service** | Descarga masiva agota disco | Límites por archivo/trabajo/usuario/área, `MIN_FREE_DISK_BYTES`, trabajos activos máximos | Valores deben aprobarse para el entorno real |
| **Denial of service** | Abuso de login/Drive | Turnstile, rate limit, backoff, límite por cuenta | Rate limit en memoria por contenedor |
| **Elevation of privilege** | Cargo “Administración” accede al panel | Roles de sistema separados; `RequireAdmin` en backend | Configuración incorrecta de roles por el administrador |
| **Elevation of privilege** | CSRF en operación admin | Token CSRF de sesión + Origin | Navegadores muy antiguos sin soporte |
| **SSRF/injection** | IDs manipulados hacia Google | Validación `^[A-Za-z0-9_-]+$` antes de construir consultas | Nuevos endpoints deben mantener la validación |
| **Supply chain** | Dependencia comprometida | Versiones fijadas, imágenes oficiales, `go.sum`/`package-lock` | Auditoría periódica y escaneo de imágenes |
| **Container escape** | Proceso comprometido | No root, read-only, sin privilegios, límites, sin docker.sock | Kernel/host deben parchearse |
| **Data loss** | Borrar snapshots por error | Sin borrado automático; retención en simulación; copias de seguridad coordinadas | Falta ensayo de restauración institucional |
| **Key loss** | Pérdida de `TOKEN_ENCRYPTION_KEY` | Respaldo separado documentado | No hay rotación automática de clave |

## Riesgos residuales aceptados en el MVP

1. **Sin MFA** para administradores locales. Mitigación recomendada: WebAuthn/TOTP.
2. **Sin antivirus/DLP** sobre documentos. Todos se sirven como `attachment` y `nosniff`, pero si se
   habilita previsualización debe añadirse análisis.
3. **Rate limiting local al proceso.** Para múltiples réplicas o exposición directa, aplicar en el
   proxy/WAF.
4. **Sin cifrado en reposo del volumen** a nivel de aplicación. Depende del disco/FS institucional.
5. **Verificación de Google pendiente** para `drive.readonly`.
6. **Sin pruebas E2E automatizadas de navegador** en la entrega; se recomienda Playwright.
7. **Auditoría mutable por administradores de BD.** Para no repudio fuerte, exportar registros a un
   almacenamiento WORM externo.
8. **Sesión de 12 h por defecto**; ajustar a la política institucional.

## Controles de borde recomendados

- TLS obligatorio y HSTS en el proxy institucional.
- Restringir el acceso al portal a la red/VPN municipal si aplica.
- Límites de tasa y tamaño en el proxy.
- Escaneo de imágenes y dependencias en CI.
- Alertas sobre:
  - picos de `reauthorization_required`;
  - errores 429 de Google;
  - espacio libre bajo;
  - intentos de login fallidos;
  - trabajos en cola con antigüedad alta.

## Respuesta a incidentes

1. Revocar sesiones (`DELETE FROM sessions`) y rotar contraseñas administrativas.
2. Marcar conexiones comprometidas como `revoked` y solicitar reconexión.
3. Rotar `TOKEN_ENCRYPTION_KEY` con re-cifrado controlado si se sospecha acceso a la BD.
4. Preservar `audit_events` y logs antes de limpiar.
5. Verificar consistencia con `deploy/scripts/consistency-check.sh`.
6. Restaurar desde copia de seguridad verificada si hay corrupción, coordinando BD + volumen + clave.
