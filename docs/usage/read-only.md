# Guía de solo lectura

El rol `read_only` supervisa la operación sin modificar datos.

## Navegación

| Categoría | Módulos |
|---|---|
| General | Dashboard |
| Organización | Trabajadores, Áreas y cargos |
| Gestión documental | Conexiones Drive, Trabajos, Almacenamiento |
| Control institucional | Auditoría |
| Cuenta y seguridad | Seguridad |

## Puede

- Consultar el dashboard.
- Consultar trabajadores y su detalle, sin formularios de escritura.
- Consultar áreas, cargos e historial organizativo.
- Consultar conexiones Drive, trabajos y metadatos de almacenamiento.
- Revisar la auditoría institucional completa.

## No puede

- Modificar trabajadores, perfiles o estados.
- Crear o editar áreas y cargos.
- Gestionar cuentas administrativas.
- Iniciar, cancelar o reintentar trabajos.
- Publicar políticas.
- Descargar documentos reservados a administradores o al propietario.

La interfaz oculta las acciones no permitidas y el backend vuelve a comprobar
cada permiso. Ningún botón de la interfaz es una autorización.
