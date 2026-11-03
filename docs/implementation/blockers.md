# Bloqueadores y dependencias externas

TERRA está implementado. Los siguientes puntos **no** pueden resolverse solo con código y no
deben declararse terminados hasta contar con evidencia institucional.

## 1. Redirect URIs de Google OAuth

El cliente OAuth de desarrollo debe tener registradas exactamente:

```
http://localhost:8080/api/v1/auth/google/callback
http://localhost:8080/api/v1/auth/google/drive/callback
```

En producción, las URLs HTTPS equivalentes bajo el dominio institucional. Si no coinciden
exactamente, Google devuelve `redirect_uri_mismatch` y ni el login ni la conexión de Drive
pueden completarse.

Responsable: propietario del proyecto Google Cloud / TI municipal.

## 2. Tipo de aplicación OAuth External y pantalla de consentimiento

TERRA usa cuentas personales, por lo que el cliente debe ser **External**, no Internal. La
pantalla de consentimiento debe incluir:

- `openid`, `email`, `profile` para inicio de sesión.
- `https://www.googleapis.com/auth/drive.readonly` para documentación.

No se usa cuenta de servicio, delegación de dominio ni unidades compartidas.

## 3. Verificación de scope restringido

`drive.readonly` es un scope restringido. Para uso fuera de usuarios de prueba, Google exige
verificación de la aplicación, política de privacidad pública, justificación del scope y, según
el caso, evaluación de seguridad. Hasta completarla:

- la app funciona en modo de prueba con usuarios de prueba autorizados;
- **no debe afirmarse que Google aprobó TERRA**;
- el número de usuarios puede estar limitado por Google.

Responsable: institución + propietario del proyecto. Ver
`docs/security/oauth-drive.md`.

## 4. Claves Turnstile por ambiente

Las claves entregadas son de desarrollo. Para producción:

- crear un widget Turnstile para el dominio institucional;
- configurar `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME` y `TURNSTILE_ACTION`;
- verificar que el hostname emitido por Siteverify coincide exactamente;
- no reutilizar claves de desarrollo en producción.

## 5. Texto de la política institucional

TERRA implementa el mecanismo de versionado y aceptación, pero **no inventa el contenido legal**.
La institución debe proporcionar el texto aprobado y publicarlo desde
`/app/admin/policy` (o `POST /api/v1/admin/policies`). Sin una versión publicada, la exploración
y las descargas quedan bloqueadas por diseño.

## 6. Límites de capacidad de producción

Los valores de `.env.example` son ilustrativos. Antes del despliegue, la institución debe aprobar:

- tamaño máximo por archivo y por trabajo;
- almacenamiento por trabajador y por área;
- trabajos activos globales y por trabajador;
- espacio libre mínimo;
- retención de snapshots.

No se deben inventar estos valores ni asumir cuotas de Google.

## 7. Infraestructura de producción

Pendiente de decisión institucional:

- hostname y certificado TLS;
- ruta del volumen (`/srv/terra-data/prod`);
- política de backups, cifrado y retención;
- monitoreo/alertas;
- procedimiento de rotación de la clave de cifrado de tokens y su resguardo separado.

## 8. Pruebas con cuentas reales

Para cerrar la aceptación de la Fase 3 se necesitan al menos dos cuentas personales de prueba
con:

- archivos binarios y documentos nativos;
- estructuras profundas, nombres repetidos y carpetas vacías;
- atajos a archivo y a carpeta;
- elementos no descargables y papelera.

Esas pruebas deben hacerse en un entorno controlado y no con datos personales reales.
