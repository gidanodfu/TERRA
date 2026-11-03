# Autorización y RBAC

## Roles de sistema

| Rol | Uso |
|---|---|
| `admin` | Administración de TERRA |
| `user` | Trabajador |

Los **cargos organizativos** (`Secretaría`, `Administración`, `Asistente`, etc.) nunca otorgan
permisos. Se almacenan en `positions` y solo clasifican documentos y snapshots.

La estructura `system_roles` + `user_roles` permite añadir permisos granulares sin tocar los cargos.

## Permisos expuestos

El endpoint `/auth/me` devuelve la lista efectiva. El frontend la usa solo para ocultar acciones.

Trabajador:

```
me.read, me.profile.write, me.drive.read, me.drive.connect, me.drive.disconnect,
me.jobs.read, me.files.read, me.policy.accept
```

Administrador:

```
admin.dashboard.read, admin.users.read, admin.users.write,
admin.organization.read, admin.organization.write,
admin.drive.read, admin.jobs.read, admin.jobs.create, admin.jobs.cancel, admin.jobs.retry,
admin.storage.read, admin.audit.read, admin.files.read
```

Un administrador también es un usuario autenticado; las rutas `/me/*` aplican.

## Reglas por recurso

| Recurso | Trabajador | Administrador |
|---|---|---|
| Perfil propio | Lee y edita nombres/área/cargo | Edita área/cargo/estado de trabajadores |
| Conexión Drive propia | Conecta, reconecta, desconecta, acepta política | **No puede** conectar ni aceptar por el trabajador |
| Carpeta Drive | No explora Drive remoto | Explora solo con conexión y política vigentes |
| Trabajos | Ve los que solicitó o cuyo Drive posee | Ve todos; crea, cancela, reintenta |
| Documentos | Solo los de sus trabajos | Todos, con auditoría `file.accessed` |
| Organización | Lee catálogo público activo | CRUD lógico |
| Auditoría | No | Sí |

## Comprobaciones obligatorias

1. `RequireAuth`: sesión válida, cuenta no suspendida/desactivada, CSRF en métodos no seguros.
2. `RequireActive`: perfil completo (`status=active`).
3. `RequireAdmin`: rol `admin` y estado activo.
4. **Nivel de recurso**:
   - trabajos: `requested_by_user_id == actor` o `drive_owner_user_id == actor` o admin;
   - documentos: se resuelve el job y se aplica la misma regla;
   - conexiones: siempre por `user_id` del path, nunca por un ID de conexión enviado por el cliente.

## Creación de descargas

- El path identifica al trabajador; el backend obtiene su conexión.
- Se rechaza cualquier `drive_connection_id` del navegador.
- Se exige conexión `connected`, refresh token presente y consentimiento de la **última** política.
- Las carpetas se validan contra Mi unidad de esa conexión.
- El trabajo guarda snapshots de área/cargo y separa `requested_by` de `drive_owner`.

## Limitaciones explícitas del administrador

- No suplanta al trabajador ni usa su propia cuenta para el Drive ajeno.
- No acepta la política en nombre del trabajador.
- No conecta la cuenta del trabajador.
- No puede suspender/desactivar su propia cuenta desde la UI administrativa (validación de servicio).

## Matriz resumida

| Acción | user | admin |
|---|---|---|
| Ver perfil propio | ✅ | ✅ |
| Editar perfil propio | ✅ | ✅ |
| Conectar Drive propio | ✅ | ❌ (sin identidad Google de trabajador) |
| Ver Drive de otro | ❌ | ✅ con autorización vigente |
| Crear snapshot | ❌ por defecto | ✅ |
| Cancelar trabajo ajeno | ❌ | ✅ |
| Ver auditoría | ❌ | ✅ |
| Descargar documento ajeno | ❌ | ✅ auditado |
