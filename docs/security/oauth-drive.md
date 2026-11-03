# OAuth de Google Drive

## Tipo de aplicación

- **External**, porque los trabajadores usan cuentas personales.
- No Internal, aunque TERRA sea un portal interno.
- Sin cuenta de servicio, sin delegación de dominio, sin unidades compartidas en el MVP.

## Dos flujos separados

| Flujo | Scopes | Redirect URI | Resultado |
|---|---|---|---|
| Login | `openid email profile` | `/api/v1/auth/google/callback` | Sesión TERRA |
| Drive | `https://www.googleapis.com/auth/drive.readonly` + `openid email` | `/api/v1/auth/google/drive/callback` | Refresh token cifrado |

El segundo flujo se inicia desde una sesión ya autenticada y se vincula al usuario de esa sesión.

## Por qué `drive.readonly`

La especificación exige explorar y descargar recursivamente **Mi unidad**, incluidos archivos
creados por otras aplicaciones y documentos nativos. `drive.file` solo da acceso a archivos que la
propia aplicación creó o que el usuario seleccionó explícitamente mediante Picker, y no garantiza el
recorrido completo. Por eso no se sustituye silenciosamente.

`drive.readonly` es un **scope restringido**. Su uso en producción requiere verificación de Google
y posiblemente evaluación de seguridad. Hasta completarla, el cliente debe permanecer en modo de
prueba con usuarios de prueba autorizados.

## Parámetros del flujo

```
response_type=code
access_type=offline
prompt=consent
include_granted_scopes=true
code_challenge_method=S256
state=<aleatorio de un solo uso>
```

- `state` se guarda hasheado en `oauth_states` (flujo `drive_connect`, usuario, expiración 10 min).
- PKCE protege el intercambio del código.
- La cookie `terra_oauth_state` liga el callback al navegador que inició el flujo.
- El callback consume el state una sola vez.

## Verificación de identidad

Después del intercambio se consulta `userinfo`. Se exige:

1. `sub` no vacío;
2. que ese `sub` corresponda al `auth_identity` Google del usuario TERRA;
3. que el scope otorgado incluya `drive.readonly`.

Si la cuenta no coincide → `drive_account_mismatch` y no se guarda nada.

## Refresh tokens

- Google puede no devolver refresh token en una reautorización. En ese caso se **conserva** el
  cifrado existente (`COALESCE` en el upsert); no se borra.
- Se cifra con AES-256-GCM antes de PostgreSQL. La clave viene de `TOKEN_ENCRYPTION_KEY` y no está
  en la base de datos.
- Solo el backend lo descifra para construir el token source de Drive.
- Nunca se registra, ni se envía al navegador, ni se incluye en respuestas.

## Renovación y errores

- `golang.org/x/oauth2` renueva access tokens automáticamente con el refresh token.
- `invalid_grant`, token revocado o 401 se clasifican como reautenticación:
  - `drive_connections.status = reauthorization_required`;
  - trabajos activos → `waiting_authorization`;
  - el worker no usa credenciales alternativas.
- 429/quota/5xx se reintentan con backoff y `Retry-After`.
- Tras reconectar y aceptar la política vigente, el trabajo `waiting_authorization` puede ser
  reclamado de nuevo.

## Desconexión

`DELETE /me/drive/connection`:

1. intenta revocar el token en `https://oauth2.googleapis.com/revoke` (best-effort);
2. borra el refresh token cifrado;
3. marca `revoked`;
4. bloquea nuevos trabajos y deja los activos en espera;
5. conserva documentos, snapshots e historial.

## Restricciones del MVP

- Solo Mi unidad. No "Compartido conmigo" como ámbito, ni unidades compartidas.
- Sin Google Vids.
- Sin sincronización continua ni bidireccional.
- Sin selección de revisiones.
- El Picker de Google no se usa; el selector es propio y valida pertenencia al árbol.

## Requisitos para producción (externos)

1. Registrar redirect URIs exactas.
2. Configurar pantalla de consentimiento con dominio verificado.
3. Publicar política de privacidad y términos.
4. Solicitar verificación del scope restringido.
5. Completar evaluación de seguridad si Google la exige.
6. No afirmar aprobación hasta recibirla.

## Pruebas

- Unitarias: clasificación de MIME/exportación, cifrado, estados.
- Integración controlada: OAuth start, reautenticación y cola verificadas.
- Pendiente: consentimiento real con al menos dos cuentas personales y archivos de prueba.
