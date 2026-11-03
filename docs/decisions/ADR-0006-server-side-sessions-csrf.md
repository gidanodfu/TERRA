# ADR-0006 — Sesiones server-side y CSRF

Estado: aceptado.

## Contexto

El navegador nunca debe recibir refresh tokens ni secretos. Los roles no deben confiarse desde el
cliente. Se requiere logout, expiración e invalidación administrativa.

## Decisión

- Token de sesión aleatorio de 32 bytes en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción.
- Solo SHA-256 del token en PostgreSQL.
- Token CSRF independiente almacenado en la sesión, replicado en cookie legible `terra_csrf`, y
  exigido en el header `X-CSRF-Token` para métodos no seguros.
- Middleware de autenticación aplica CSRF antes de llegar al handler.
- La sesión se invalida en logout, expiración y suspensión/desactivación (trigger).
- Roles y permisos se cargan desde PostgreSQL en cada petición.

## Consecuencias

- No hay JWT en el navegador ni secretos en `localStorage`.
- El SPA debe enviar el header CSRF; el cliente HTTP lo hace automáticamente.
- Un XSS en el origen podría leer la cookie CSRF, pero no la de sesión; la defensa principal sigue
  siendo evitar XSS y la rotación de sesión.
- El rate limit en memoria no se comparte entre réplicas; documentado como limitación.
