# Guía del administrador

El rol `admin` dispone de todos los permisos administrativos. Cada operación
sensible se valida en backend y se registra en auditoría.

## Navegación

| Categoría | Módulos |
|---|---|
| General | Dashboard |
| Organización | Trabajadores, Áreas y cargos |
| Gestión documental | Conexiones Drive, Descargas, Trabajos |
| Control institucional | Auditoría, Política |
| Cuenta y seguridad | Seguridad |

## Trabajadores

- Lista y filtra trabajadores por búsqueda, estado, área y cargo.
- Abre el detalle para consultar conexión, historial y datos personales.
- Modifica área y cargo en conjunto.
- Cambia el estado: activo, perfil pendiente, suspendido o desactivado.
- Suspender o desactivar invalida las sesiones del trabajador.
- Un administrador no puede suspender o desactivar su propia cuenta.
- Las cuentas administrativas se gestionan en la pestaña correspondiente, no en
  el módulo de trabajadores.

## Cuentas administrativas

- Crea cuentas con rol `admin`, `moderator` o `read_only`.
- Exige nombres, apellidos, username único, contraseña de al menos 12 caracteres
  y confirmación coincidente.
- La cuenta nace con cambio obligatorio de contraseña.
- El administrador principal (`bootstrap_state.details.admin_user_id`) no puede
  desactivarse.
- Una cuenta no puede desactivarse a sí misma.
- Los roles desconocidos o mixtos no reciben permisos.

## Áreas y cargos

- El nombre del área es obligatorio, único y de hasta 120 caracteres.
- El nombre del cargo es único dentro de su área.
- Un cargo solo puede asignarse a un área activa.
- Las responsabilidades son descriptivas: no otorgan permisos.
- Máximo 20 responsabilidades por lista y 300 caracteres por elemento.
- No se admiten elementos vacíos ni duplicados dentro de la misma lista.
- Los nombres se normalizan sin distinguir mayúsculas, espacios repetidos ni
  composición Unicode; los acentos siguen siendo significativos.

## Conexiones Drive

Consulta el estado de las conexiones y explora el Drive de un trabajador cuando
la conexión y la política están vigentes. El administrador no puede autorizar
Drive en nombre del trabajador.

## Descargas

- Selecciona un trabajador activo con área, cargo, conexión vigente y política
  aceptada.
- Alcances disponibles: **Mi unidad completa** y **archivos y carpetas
  seleccionados**.
- El trabajo se encola; no se descarga dentro de la petición HTTP.
- Los límites de trabajos activos, almacenamiento por usuario/área y espacio
  libre se validan antes de crear el trabajo.
- La clave de idempotencia evita duplicar un trabajo ante reintentos.

## Trabajos y almacenamiento

- Consulta trabajos con filtros por estado, texto, área, cargo y fechas.
- Puede cancelar trabajos y reintentar elementos fallidos según los permisos.
- Desde el detalle puede descargar archivos completados con su identificador
  interno de almacenamiento; el acceso queda auditado.
- El almacenamiento físico es interno: no hay un módulo independiente de
  Almacenamiento.

## Auditoría

El administrador dispone de auditoría institucional completa. Los eventos no
incluyen contraseñas, tokens ni contenido documental.

## Política institucional

Publica versiones aprobadas. La versión es obligatoria, única y de hasta 60
caracteres. El contenido es obligatorio. Una versión nueva obliga a los
trabajadores a aceptarla antes de nuevas descargas.

## Seguridad

Cambio de contraseña propio, con la misma política y la misma invalidación de
otras sesiones descrita para los trabajadores.
