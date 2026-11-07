# Google Cloud, OAuth 2.0 y Google Drive

Guía operativa para habilitar Google Drive API y configurar los dos flujos OAuth
que usa TERRA. No incluya Client Secrets, tokens ni credenciales reales en
documentación, capturas, incidencias o Git.

## 1. Arquitectura OAuth real

TERRA usa un mismo OAuth Client de tipo **Aplicación web** para dos flujos
independientes:

| Flujo | Scopes solicitados | Redirect URI |
|---|---|---|
| Inicio de sesión | `openid`, `email`, `profile` | `http://localhost:8080/api/v1/auth/google/callback` |
| Autorización de Drive | `https://www.googleapis.com/auth/drive.readonly`, `openid`, `email` | `http://localhost:8080/api/v1/auth/google/drive/callback` |

- El acceso a Drive es individual: cada trabajador autoriza su propia cuenta.
- TERRA no usa cuenta de servicio, delegación de dominio ni unidades compartidas.
- No se solicitan permisos de escritura.
- El login usa PKCE y `prompt=select_account`.
- La conexión de Drive usa PKCE, `access_type=offline`, `prompt=consent` e
  `include_granted_scopes=true`.
- El scope `drive.readonly` es amplio para lectura, pero no permite modificar los
  originales.

Código de referencia:

- `backend/internal/platform/googleoauth/googleoauth.go`
- `backend/internal/platform/config/config.go`
- `backend/internal/auth/handler.go`
- `backend/internal/drive/handler.go`
- `backend/internal/drive/service.go`

## 2. Proyecto de Google Cloud

1. Abra [Google Cloud Console](https://console.cloud.google.com/).
2. Seleccione el proyecto en la barra superior.
3. Si no existe, cree un proyecto para TERRA.
4. Confirme el nombre y el identificador del proyecto antes de continuar.
5. Mantenga proyectos separados para desarrollo y producción. Las credenciales
   de desarrollo no deben reutilizarse sin revisión en producción.

La consola muestra el proyecto activo en la parte superior; todas las pantallas
posteriores pertenecen a ese proyecto.

## 3. Habilitar Google Drive API

Ruta:

```text
Google Cloud Console → APIs y servicios → Biblioteca
```

1. Busque `Google Drive API`.
2. Abra el resultado correcto.
3. Compruebe el proyecto seleccionado.
4. Pulse **Habilitar**.
5. Verifique que el estado sea **Habilitada**.

No active APIs adicionales sin una necesidad demostrada por el código. No cree
una API Key: TERRA usa OAuth 2.0, no claves de API.

## 4. Google Auth Platform: Información de la marca

Ruta:

```text
Google Auth Platform → Información de la marca
```

Registre:

- Nombre de la aplicación: `TERRA`.
- Correo de asistencia.
- Contacto del desarrollador.
- Logotipo, si la institución lo proporciona.
- Página principal pública, política de privacidad y términos, cuando existan.
- Dominios autorizados.

En desarrollo local puede faltar la página pública y los documentos legales
definitivos. Para producción deben publicarse en el dominio real y cumplir los
requisitos de Google. No invente correos institucionales, dominios ni datos
legales.

## 5. Google Auth Platform: Público

Ruta:

```text
Google Auth Platform → Público
```

### External

Permite cuentas Google externas, incluidas cuentas personales Gmail. Es la
configuración que corresponde al funcionamiento actual de TERRA.

### Internal

Solo está disponible cuando el proyecto pertenece a una organización Google
Workspace y el acceso debe limitarse a sus usuarios. No la seleccione para
cuentas personales.

### Desarrollo y pruebas

Mantenga:

```text
Estado de publicación: Prueba
```

1. Abra **Usuarios de prueba**.
2. Pulse **Agregar usuarios**.
3. Registre cada cuenta Google que probará el acceso o la conexión de Drive.
4. Guarde los cambios.

Aclaraciones importantes:

- Los correos de esta lista son cuentas Google, no usernames administrativos de
  TERRA.
- Cada cuenta Google que vaya a autorizar TERRA debe estar registrada.
- La lista admite hasta 100 usuarios de prueba.
- Con una aplicación External en estado Prueba, las autorizaciones expiran a los
  siete días. Como TERRA solicita `drive.readonly` y acceso offline, el refresh
  token también queda sujeto a esa caducidad.
- Durante las pruebas puede ser necesario volver a autorizar Drive cada semana.
  Esto no es un fallo del backend.

## 6. Google Auth Platform: Acceso a los datos

Ruta:

```text
Google Auth Platform → Acceso a los datos
```

Declare exactamente:

```text
openid
email
profile
https://www.googleapis.com/auth/drive.readonly
```

Finalidad:

| Scope | Uso |
|---|---|
| `openid` | Identificar la cuenta y obtener un `sub` estable. |
| `email` | Conocer el correo de la cuenta. |
| `profile` | Nombre e información básica del perfil. |
| `drive.readonly` | Explorar y descargar archivos del Drive del usuario. |

`drive.readonly` no permite modificar ni borrar originales. No amplíe los scopes
para simplificar la implementación y no use `drive` si solo se necesita lectura.

### Verificación futura

`drive.readonly` es un scope restringido. Para usar la aplicación fuera del
entorno de prueba pueden exigirse:

- verificación de la marca;
- verificación del acceso a los datos;
- justificación del scope;
- política de privacidad pública;
- demostración del funcionamiento;
- evaluación de seguridad adicional cuando corresponda.

Como TERRA procesa y almacena datos de Drive en su propio servidor, revise los
requisitos de evaluación de seguridad aplicables a scopes restringidos. No
afirme que TERRA está verificado o aprobado por Google hasta recibir la
confirmación.

## 7. Crear el OAuth Client ID

Ruta:

```text
Google Auth Platform → Clientes → Crear cliente → Aplicación web
```

Nombre sugerido:

```text
TERRA - Desarrollo local
```

### Orígenes autorizados de JavaScript

```text
http://localhost:8080
```

Debe coincidir con el origen desde donde se usa TERRA. No use comodines. En
producción registre únicamente el dominio HTTPS definitivo.

### URIs de redireccionamiento autorizadas

```text
http://localhost:8080/api/v1/auth/google/callback
http://localhost:8080/api/v1/auth/google/drive/callback
```

Son dos callbacks distintos y ambos son necesarios. El protocolo, host, puerto y
ruta deben coincidir exactamente con `GOOGLE_REDIRECT_URL` y
`GOOGLE_DRIVE_REDIRECT_URL`. No registre los callbacks como orígenes JavaScript.

### Credenciales

1. Copie el **Client ID**.
2. Copie el **Client Secret**.
3. Guárdelos solo en el `.env` local del backend.
4. No los incorpore a React ni a variables `VITE_*`.
5. No los incluya en documentación, capturas, incidencias ni Git.

## 8. Variables de entorno

`.env.example` es la referencia. Complete en `.env`:

```dotenv
APP_PUBLIC_URL=http://localhost:8080

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GOOGLE_REDIRECT_URL=http://localhost:8080/api/v1/auth/google/callback

GOOGLE_DRIVE_REDIRECT_URL=http://localhost:8080/api/v1/auth/google/drive/callback

GOOGLE_DRIVE_SCOPES=https://www.googleapis.com/auth/drive.readonly
```

TERRA también necesita, entre otras, `SESSION_SECRET` y
`TOKEN_ENCRYPTION_KEY` para iniciar correctamente:

```bash
openssl rand -hex 32      # SESSION_SECRET
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
```

Mantenga permisos restrictivos:

```bash
chmod 600 .env
```

No versione `.env` y no copie el Client Secret a ninguna variable `VITE_*`.

## 9. Aplicar la configuración

Docker inyecta las variables al crear los contenedores. Un reinicio simple no
recarga `.env`.

```bash
./terra check
./terra up --recreate=api
./terra up --recreate=worker
./terra doctor
```

No elimine volúmenes ni reconstruya imágenes sin necesidad.

## 10. Prueba funcional

### Autenticación

1. Abra `http://localhost:8080`.
2. Pulse **Continuar con Google**.
3. Inicie sesión con una cuenta registrada como usuario de prueba.
4. Acepte los permisos de identidad.
5. Compruebe el ingreso a TERRA.

### Conexión de Drive

1. Abra **Google Drive** desde la cuenta del trabajador.
2. Inicie la conexión individual.
3. Use la misma cuenta Google con la que inició sesión en TERRA.
4. Acepte el permiso de lectura de Drive.
5. Complete el callback.
6. Verifique que la conexión aparece como `connected`.
7. Confirme la cuenta autorizada.
8. Explore carpetas y archivos.
9. Ejecute una prueba de snapshot controlada.

Condiciones que el backend verifica:

- la cuenta autorizada para Drive corresponde a la identidad Google de la sesión;
- el scope concedido incluye `drive.readonly`;
- existe una política publicada y aceptada para poder explorar y descargar.

No use archivos personales sensibles en las pruebas.

## 11. Cuotas y límites de Google Drive API

Ruta:

```text
Google Cloud Console → APIs y servicios → Google Drive API → Cuotas y límites del sistema
```

Allí puede consultar:

- consumo y métricas por proyecto;
- límites por minuto y por usuario;
- solicitudes rechazadas.

Interpretación habitual:

- `403` puede indicar permiso insuficiente, scope no concedido, cuota agotada o
  política de la organización.
- `429` indica demasiadas solicitudes y debe respetarse `Retry-After`.

TERRA pagina los listados, acota el tamaño de página y trata los errores de
Google con reintentos y clasificación de reautenticación. No aumente cuotas de
forma preventiva. Solicite un aumento solo con una necesidad medida y
justificada. Los valores de cuota mostrados en una captura no son universales
para todos los proyectos.

## 12. Preparación para producción

**Las pruebas locales no equivalen a una publicación productiva.**

Para producción:

1. Cree un proyecto independiente.
2. Cree credenciales OAuth independientes.
3. Registre solo orígenes HTTPS de producción.
4. Registre los callbacks HTTPS definitivos.
5. Complete la información de marca.
6. Publique política de privacidad y términos definitivos.
7. Verifique los dominios.
8. Declare los scopes.
9. Complete la verificación de scopes restringidos.
10. Configure contactos institucionales.
11. Pruebe con cuentas reales.
12. Confirme las políticas de protección de datos.

Cambiar `APP_PUBLIC_URL` no publica TERRA. La verificación de Google, la
infraestructura y el despliegue son procesos independientes. La distribución
local de TERRA no incluye una arquitectura de despliegue productivo.
