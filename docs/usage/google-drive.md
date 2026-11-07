# Conexión individual de Google Drive

Cada trabajador autoriza su propia cuenta de Google. TERRA no usa cuenta de
servicio ni delegación de dominio y nunca solicita permisos de escritura.

## Requisitos

1. Haber iniciado sesión en TERRA con la misma cuenta Google que se autorizará.
2. Tener el perfil activo, con área y cargo.
3. Que exista una política institucional publicada.
4. Que la cuenta Google esté registrada como usuario de prueba mientras la
   aplicación OAuth permanezca en estado **Prueba**.

La configuración de Google Cloud se detalla en
[Google Cloud, OAuth 2.0 y Google Drive](../integrations/google-cloud-drive-oauth.md).

## Conectar

1. Abra **Google Drive** en la navegación del trabajador.
2. Pulse **Conectar Google Drive**.
3. El backend crea un `state` de un solo uso y redirige a Google con PKCE.
4. Autorice el permiso `https://www.googleapis.com/auth/drive.readonly`.
5. Google devuelve el control al callback
   `/api/v1/auth/google/drive/callback`.
6. TERRA verifica que la cuenta autorizada sea la misma identidad Google de la
   sesión.
7. La conexión queda en estado `connected` y muestra la cuenta autorizada.

Si la cuenta no coincide, el callback termina con `account_mismatch` y no se
guarda ninguna credencial.

## Aceptar la política

La conexión y el consentimiento institucional son controles distintos:

1. La conexión habilita el acceso técnico a Drive.
2. La aceptación de la política vigente habilita explorar y descargar.
3. Si se publica una versión nueva, el trabajador debe aceptarla de nuevo.

## Reautorizar

La conexión pasa a `reauthorization_required` cuando Google invalida el token o
el refresh token deja de ser utilizable. Entonces:

- los trabajos activos quedan en `waiting_authorization`;
- el trabajador debe pulsar **Reautorizar Google Drive**;
- tras reconectar y aceptar la política vigente, el trabajo puede reanudarse.

Durante las pruebas con aplicación External y estado **Prueba**, las
autorizaciones y el refresh token pueden caducar a los siete días. Volver a
autorizar semanalmente es un comportamiento esperado de Google, no un fallo del
backend.

## Desconectar

**Desconectar Google Drive**:

1. intenta revocar el token en Google;
2. elimina el refresh token cifrado;
3. marca la conexión como `revoked`;
4. impide iniciar trabajos nuevos;
5. conserva documentos, snapshots e historial ya almacenados.

## Seguridad

- El refresh token se cifra con AES-256-GCM antes de guardarse.
- La clave `TOKEN_ENCRYPTION_KEY` vive fuera de PostgreSQL y no se versiona.
- El token nunca llega al navegador ni se incluye en respuestas o registros.
- La exploración solo recorre **Mi unidad**; no se admiten unidades compartidas
  ni el Picker de Google en esta versión.
