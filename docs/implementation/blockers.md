# Bloqueadores y dependencias externas

TERRA está implementado como distribución local. Los siguientes puntos requieren
acciones fuera del repositorio y no deben declararse resueltos sin evidencia.

## 1. Redirect URIs de Google OAuth

El cliente OAuth local debe registrar exactamente:

```text
http://localhost:8080/api/v1/auth/google/callback
http://localhost:8080/api/v1/auth/google/drive/callback
```

Si el puerto local cambia (`WEB_PORT`), las URIs deben actualizarse en Google Cloud
y en `.env`.

## 2. Cliente OAuth External

Los trabajadores usan cuentas personales. El cliente debe ser **External**, no
Internal. Debe incluir `openid`, `email`, `profile` y:

```text
https://www.googleapis.com/auth/drive.readonly
```

No se usa cuenta de servicio, delegación de dominio ni unidades compartidas.

## 3. Verificación de scope restringido

`drive.readonly` es un scope restringido. Para uso fuera de usuarios de prueba,
Google exige verificación de la aplicación, política de privacidad pública,
justificación del scope y posiblemente evaluación de seguridad. Mientras no esté
completada:

- la app funciona con usuarios de prueba autorizados;
- **no debe afirmarse que Google aprobó TERRA**;
- el número de usuarios puede estar limitado.

Cada entidad que adopte el proyecto deberá gestionar su propia verificación si decide
usar TERRA fuera del entorno local.

## 4. Claves Turnstile

Las claves entregadas para desarrollo deben corresponder al hostname local
(`localhost`) y action `admin_login`. Si se usan claves de otro widget, el login
administrativo fallará de forma segura. No se deben inventar claves.

## 5. Texto de la política institucional

El mecanismo de versionado y aceptación está implementado. El contenido legal debe
ser proporcionado y aprobado por la entidad; no se incluye texto ficticio. Sin una
versión publicada, la exploración y las descargas quedan bloqueadas.

## 6. Pruebas con cuentas reales

Para validar el adaptador de Drive se necesitan cuentas personales de prueba con:

- archivos binarios y documentos nativos;
- carpetas vacías, nombres repetidos y estructuras profundas;
- atajos a archivo y carpeta;
- archivos no descargables y papelera;
- revocación y reconexión OAuth.

Estas pruebas son manuales, opt-in y no deben usar datos personales reales.

## 7. Límites locales

Los límites de `.env.example` son valores de desarrollo. No representan cuotas de
Google ni límites institucionales. Cada entidad ajustará los suyos si adopta el
proyecto fuera de esta distribución local.
