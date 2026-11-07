# Guía del trabajador

El rol `user` solo accede a sus propios recursos. La navegación se organiza en
**General**, **Gestión documental** y **Cuenta y seguridad**.

## Primer acceso

1. Abra TERRA y seleccione **Continuar con Google**.
2. Autorice una cuenta Google con correo verificado.
3. Si TERRA no tiene su perfil completo, se abre la configuración inicial.
4. Registre nombres, apellidos, área y cargo activos.
5. Al guardar, la cuenta pasa a `active` y se abre el inicio.

La relación área/cargo se valida en el backend: el área debe estar activa y el
cargo debe pertenecer a esa área.

## Inicio

Muestra el estado de la cuenta y los accesos a los módulos propios. Un perfil
incompleto no puede usar Drive ni descargas.

## Mi perfil

Permite actualizar nombres, apellidos, área y cargo. El backend rechaza cambios
organizativos inválidos y conserva un historial de la asignación.

## Google Drive

Permite conectar, reautorizar o desconectar la cuenta personal de Google. El
acceso es individual: ningún administrador puede suplantar al trabajador. El
detalle está en [Conexión de Google Drive](google-drive.md).

## Mis descargas

Lista los trabajos solicitados por el trabajador o ejecutados sobre su Drive.
Cada trabajo muestra estado, progreso, errores y elementos. Desde el detalle se
puede cancelar un trabajo en curso cuando el estado lo permite.

## Documentos desde los trabajos

Este módulo independiente fue retirado. Los archivos se consultan desde el
detalle de cada trabajo, donde los elementos completados ofrecen **Descargar**
cuando existe un archivo almacenado disponible.

## Seguridad

- Muestra el estado de la cuenta, el método de acceso y el área/cargo.
- Las cuentas con credenciales locales pueden cambiar su contraseña.
- El cambio exige la contraseña actual, una nueva de al menos 12 caracteres y
  distinta de la actual.
- Al cambiar la contraseña se invalidan las demás sesiones; la sesión actual se
  conserva.
- Las cuentas que solo usan Google no tienen contraseña local en TERRA.

## Restricciones

- No se puede conectar Drive con una cuenta Google distinta a la usada para
  iniciar sesión en TERRA.
- Si la conexión requiere reautorización, los trabajos activos quedan en espera
  hasta reconectar y aceptar la política vigente.
- La política institucional es independiente del consentimiento OAuth.
