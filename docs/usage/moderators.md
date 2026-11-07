# Guía del moderador

El rol `moderator` gestiona la operación diaria de trabajadores y consulta la
actividad, sin administrar configuración institucional.

## Navegación

| Categoría | Módulos |
|---|---|
| General | Dashboard |
| Organización | Trabajadores, Áreas y cargos |
| Gestión documental | Conexiones Drive, Trabajos |
| Control institucional | Auditoría |
| Cuenta y seguridad | Seguridad |

## Puede

- Consultar trabajadores y su detalle.
- Modificar área, cargo y estado de trabajadores.
- Consultar áreas, cargos e historial organizativo.
- Consultar conexiones Drive y explorar el Drive de un trabajador cuando la
  conexión y la política están vigentes.
- Consultar trabajos y su detalle.
- Revisar la auditoría operacional: trabajadores, conexiones, trabajos y
  aceptación de políticas.

## No puede

- Crear, desactivar o reactivar cuentas administrativas.
- Crear o editar áreas y cargos.
- Publicar políticas institucionales.
- Iniciar descargas, cancelar trabajos o reintentar elementos.
- Consultar almacenamiento.
- Consultar la auditoría de seguridad y administración.

Los módulos no autorizados no aparecen en la navegación y el backend rechaza sus
endpoints aunque se invoquen directamente.

## Límites de la asignación

Las mismas reglas del administrador se aplican al moderador: área activa, cargo
perteneciente al área, estado válido y protección frente a la autosuspensión.
