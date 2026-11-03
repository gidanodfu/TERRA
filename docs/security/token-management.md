# Gestión de tokens y secretos

## Secretos de TERRA

| Secreto | Uso | Almacenamiento |
|---|---|---|
| `SESSION_SECRET` | Hash de IP de auditoría y material auxiliar | `.env` / gestor de secretos |
| `TOKEN_ENCRYPTION_KEY` | AES-256-GCM para refresh tokens | `.env` + respaldo separado |
| `TURNSTILE_SECRET_KEY` | Siteverify | `.env` |
| `GOOGLE_CLIENT_SECRET` | OAuth | `.env` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Bootstrap único | `.env`, rotar en primer acceso |
| `POSTGRES_PASSWORD` | PostgreSQL | `.env` |

Reglas:

- `.env` no se versiona.
- No se usan prefijos `VITE_` para secretos; solo la site key pública de Turnstile llega al navegador.
- Las imágenes no copian `.env`.
- Los logs no incluyen tokens, códigos OAuth, cookies, contraseñas ni contenido.

## Refresh tokens de Google

Formato almacenado: `nonce (12 B) || ciphertext || tag` de AES-256-GCM, en `bytea`.

- Clave de 32 bytes, base64 en configuración.
- Un nonce aleatorio por cifrado.
- Cualquier manipulación falla la autenticación GCM.
- El texto plano solo existe en memoria del proceso que renueva el token.
- Se descifra por trabajo/conexión; no se cachea en disco.

## Rotación de la clave de cifrado

La implementación actual usa una sola clave activa. Para rotar:

1. detener worker y API;
2. generar nueva clave;
3. ejecutar un procedimiento de re-cifrado que descifre con la clave anterior y cifre con la nueva
   (script a implementar en la institución; no incluido para evitar una herramienta destructiva);
4. actualizar `TOKEN_ENCRYPTION_KEY`;
5. arrancar y verificar conexiones.

**Riesgo:** perder la clave inutiliza todos los refresh tokens; los trabajadores deben reconectar.
Respaldar la clave por un canal separado del backup de PostgreSQL y del volumen.

## Tokens de sesión

- 32 bytes aleatorios; solo SHA-256 en `sessions.token_hash`.
- El token bruto vive en la cookie HttpOnly.
- CSRF token separado, almacenado en la sesión.
- Expiración absoluta; logout y suspensión borran filas.

## Tokens OAuth de identidad

- El access token de login se usa solo para `userinfo` durante el callback.
- No se persiste.
- El refresh token de login no se solicita (`access_type=online`).

## Tokens OAuth de Drive

- Se solicita `offline` y `prompt=consent`.
- Access tokens en memoria, renovados por la librería; no se persisten.
- Refresh token cifrado según lo anterior.
- En reautorización sin refresh token nuevo, se conserva el anterior.

## Registro y auditoría

Permitido: IDs internos, `request_id`, `job_id`, códigos de error, correo enmascarado si hace falta.
Prohibido: token, cookie, código OAuth, contraseña, hash de contraseña, contenido documental,
URL firmada de descarga.

## Recomendaciones operativas

- Mantener `.env` con permisos 600 y fuera de Git.
- Restringir lectura de `.env` al usuario de despliegue.
- Rotar credenciales que hayan estado expuestas (incluidas las de desarrollo compartidas por chat).
- Configurar alertas ante errores de autenticación y reconexiones masivas.
- No reutilizar claves de desarrollo fuera de esta distribución local.
