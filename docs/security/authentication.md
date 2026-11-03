# Autenticación

TERRA tiene dos mecanismos distintos y deliberadamente separados.

## A. Trabajadores — Google OAuth/OIDC

1. `GET /api/v1/auth/google/start` genera `state` y verificador PKCE.
2. Se guarda el hash SHA-256 del `state`, el verificador y una expiración de 10 minutos en
   `oauth_states` (flujo `login`).
3. El navegador se redirige a Google con `openid email profile`, `access_type=online` y PKCE S256.
4. El callback valida que el `state` coincida con la cookie HttpOnly y consume el registro de forma
   atómica (`UPDATE ... WHERE consumed_at IS NULL RETURNING`).
5. Se intercambia el código con el verificador y se consulta `userinfo` sobre TLS.
6. Se exige `sub` estable y `email_verified=true`.
7. Se busca la identidad por `(google, sub)`. Si no existe y el correo verificado corresponde a una
   cuenta TERRA sin identidad Google, se vincula; si no, se crea un usuario `pending_profile`.
8. Se emite sesión server-side y se redirige a `/onboarding` o `/app`.

No se usa el ID token como única prueba: la identidad se obtiene de `userinfo` con el access token
del código intercambiado. No se almacenan access tokens de identidad.

## B. Administradores — credenciales locales

- Usuario y contraseña contra `local_credentials`.
- Contraseña con **Argon2id** (`m=64MiB, t=3, p=2`, salt 16 B, hash 32 B) en formato PHC.
- Verificación en tiempo constante; usuario inexistente ejecuta una verificación dummy para reducir
  diferencias de tiempo.
- **Turnstile obligatorio** validado en backend contra Siteverify.
- Rate limit por IP y por identidad.
- `must_rotate_password=true` en el bootstrap; `/app/security` fuerza el cambio.
- Cambiar contraseña invalida las demás sesiones.

## Sesiones

- Token aleatorio de 32 bytes (base64url); en PostgreSQL solo se guarda SHA-256.
- Cookie principal `terra_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` solo bajo HTTPS,
  expiración `SESSION_TTL_HOURS`.
- Cookie CSRF `terra_csrf` legible por el SPA; el header `X-CSRF-Token` debe igualar el valor
  almacenado en la sesión.
- `last_seen_at` se actualiza en cada petición; la expiración es absoluta.
- Logout borra la fila de sesión y las cookies.
- Suspensión/desactivación borra todas las sesiones mediante trigger de PostgreSQL.
- No se usan JWT en el navegador ni roles confiados desde el cliente.

## CSRF

Todo método no seguro autenticado exige triple coincidencia:

```
cookie terra_csrf == header X-CSRF-Token == sessions.csrf_token
```

Además, el login administrativo valida `Origin` cuando el navegador lo envía. `SameSite=Lax`
reduce el riesgo de envío cross-site; la verificación de token es la defensa principal.

## Turnstile

- Widget renderizado explícitamente con `VITE_TURNSTILE_SITE_KEY`.
- Backend llama a `https://challenges.cloudflare.com/turnstile/v0/siteverify` con secreto, token y IP.
- Se valida `success`, `action` configurada y `hostname` configurado.
- Tokens inválidos, expirados, reutilizados o de otro hostname se rechazan.
- Si Cloudflare no responde, el login falla cerrado (`502`).
- El rate limit se aplica incluso con Turnstile válido.

## Bootstrap

`/app/bootstrap` dentro del contenedor `api`:

1. valida configuración;
2. conecta a PostgreSQL;
3. aplica migraciones;
4. prepara directorios;
5. crea el administrador solo si el username no existe;
6. guarda únicamente el hash Argon2id y `must_rotate_password=true`;
7. registra `bootstrap_state`.

Reejecutarlo no sobrescribe credenciales. No es un quinto servicio.

## Riesgos y recomendaciones

- El rate limit es en memoria por contenedor; con varias réplicas de API se necesita un limitador
  compartido o límites en el proxy. Cubre login, creación/lectura de trabajos, navegación de Drive,
  lectura de documentos y operaciones administrativas.
- No hay MFA local; se recomienda evaluar WebAuthn/TOTP para administradores.
- La sesión no se renueva deslizantemente; ajustar `SESSION_TTL_HOURS` según política.
