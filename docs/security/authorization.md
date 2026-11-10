# Autorización y RBAC

## Roles de sistema

| Rol | Uso |
|---|---|
| `admin` | Administración completa de TERRA |
| `moderator` | Gestión operativa de trabajadores y auditoría operacional |
| `read_only` | Consulta institucional y auditoría completa |
| `user` | Trabajador |

Los **cargos organizativos** (`Secretaría`, `Administración`, `Asistente`, etc.) nunca otorgan
permisos. Se almacenan en `positions` y solo clasifican documentos y snapshots.
Las responsabilidades de áreas y cargos son texto descriptivo: tampoco otorgan permisos ni
modifican la matriz RBAC. La autorización depende exclusivamente de los roles del sistema.

La estructura `system_roles` + `user_roles` permite asignar exactamente un rol administrativo
por cuenta. Las cuentas mixtas o con roles desconocidos no reciben permisos.

## Permisos efectivos

La matriz se resuelve en `backend/internal/platform/rbac` y se expone mediante `/auth/me`.
El frontend usa los permisos solo para construir navegación y ocultar acciones; el backend
los vuelve a comprobar en cada endpoint.

Trabajador:

```
me.read, me.profile.write, me.drive.read, me.drive.connect, me.drive.disconnect,
me.jobs.read, me.policy.accept
```

Administrador:

```
admin.dashboard.read, admin.users.read, admin.users.write,
admin.accounts.read, admin.accounts.create, admin.accounts.write,
admin.organization.read, admin.organization.write,
admin.drive.read, admin.drive.browse,
admin.jobs.read, admin.jobs.create, admin.jobs.cancel, admin.jobs.retry,
admin.audit.read, admin.policy.write, admin.files.read
```

Moderador:

```
admin.dashboard.read, admin.users.read, admin.users.write,
admin.organization.read, admin.drive.read, admin.jobs.read,
admin.audit.operational.read
```

Solo lectura:

```
admin.dashboard.read, admin.users.read, admin.organization.read,
admin.drive.read, admin.jobs.read, admin.audit.read
```

Los permisos `admin.users.write` solo permiten modificar cuentas clasificadas como
trabajadores. Nunca autorizan crear, consultar ni cambiar cuentas administrativas; esas
operaciones dependen exclusivamente de `admin.accounts.*`.

## Auditoría completa y operacional

- `admin.audit.read`: auditoría institucional completa. Lo tienen `admin` y `read_only`.
- `admin.audit.operational.read`: auditoría operacional limitada. Solo lo tiene `moderator`.
- El alcance se resuelve en el backend desde los permisos del principal; el cliente no
  puede elegirlo con parámetros como `scope=full`.
- La auditoría operacional usa una allowlist explícita:
  `admin.user.updated` (solo `metadata.kind=worker`), `user.profile.updated`,
  `drive.connected`, `drive.disconnected`, `download_job.created`,
  `download_job.cancel_requested`, `download_job.retried` y `policy.accepted`.
- Los metadatos operacionales se sanean por acción. Nunca se exponen IPHash, correos,
  claves de idempotencia, secretos ni contenido documental.
- El COUNT, los filtros y la paginación se calculan con las mismas restricciones de alcance.
- Dashboard y Auditoría usan exactamente el mismo alcance.
- Las altas y cambios de áreas/cargos registran `area.*` y `position.*` con sus
  responsabilidades antes/después en la misma transacción; la auditoría operacional
  no incorpora estos eventos si no están en su allowlist.

## Reglas por recurso

| Recurso | Trabajador | Moderador | Solo lectura | Administrador |
|---|---|---|---|---|
| Perfil propio | Lee y edita nombres/área/cargo | Sin perfil de trabajador | Sin perfil de trabajador | Sin perfil de trabajador |
| Trabajadores | No | Lee y modifica asignación/estado | Solo consulta | Gestión completa |
| Cuentas administrativas | No | No | No | Crea, consulta y cambia estado |
| Organización | Catálogo público activo | Consulta | Consulta | CRUD lógico |
| Conexiones Drive | Solo la propia | Consulta | Consulta | Consulta y exploración |
| Trabajos | Solo los propios | Consulta todos | Consulta todos | Todos; crea, cancela y reintenta |
| Documentos | Solo los de sus trabajos, desde el detalle del trabajo | No descarga ajenos | No descarga ajenos | Todos, con `admin.files.read` y auditoría |
| Almacenamiento físico | Interno, sin listado independiente | Interno | Interno | Interno; se consulta desde los trabajos |
| Auditoría | No | No | Completa | Completa |
| Auditoría operacional | No | No | No | Sí (limitada) |
| Política | Acepta la vigente | No publica | No publica | Publica |

## Comprobaciones obligatorias

1. `RequireAuth`: sesión válida, cuenta no suspendida/desactivada y CSRF en métodos no seguros.
2. `RequireActive`: perfil completo (`status=active`).
3. `RequirePermission(permission)`: comprueba la matriz RBAC del principal.
4. **Nivel de recurso**:
   - trabajos: `requested_by_user_id == actor`, `drive_owner_user_id == actor` o permiso
     `admin.jobs.read`;
   - documentos: se resuelve el job y se aplica la misma regla;
   - conexiones: siempre por `user_id` del path, nunca por un ID de conexión enviado por el cliente.

## Creación de cuentas administrativas

- Solo `admin.accounts.create`.
- Rol obligatorio entre `admin`, `moderator` y `read_only`.
- La cuenta se crea en una transacción: `users`, `local_credentials`, `user_roles` y auditoría.
- Estado inicial `active`, sin área, cargo, identidad Google ni rol `user`.
- Contraseña Argon2id con `must_rotate_password=true`; nunca se registra ni se devuelve.
- El endpoint de creación tiene limitación de solicitudes propia.

## Protección del administrador principal

- Se identifica por `bootstrap_state.details.admin_user_id`, nunca por nombre.
- No puede desactivarse a sí mismo.
- Ningún administrador puede desactivarlo.
- Si el identificador no se puede resolver, la desactivación administrativa falla de forma segura.
- La desactivación invalida todas las sesiones del destinatario y queda auditada.

## Matriz resumida

| Acción | user | read_only | moderator | admin |
|---|---|---|---|---|
| Ver perfil propio | ✅ | ❌ | ❌ | ❌ |
| Editar perfil organizativo propio | ✅ | ❌ | ❌ | ❌ |
| Ver trabajadores | ❌ | ✅ | ✅ | ✅ |
| Modificar trabajador | ❌ | ❌ | ✅ | ✅ |
| Ver cuentas administrativas | ❌ | ❌ | ❌ | ✅ |
| Crear cuenta administrativa | ❌ | ❌ | ❌ | ✅ |
| Desactivar cuenta administrativa | ❌ | ❌ | ❌ | ✅* |
| Consultar organización | ❌ | ✅ | ✅ | ✅ |
| Modificar organización | ❌ | ❌ | ❌ | ✅ |
| Consultar conexiones Drive | Solo propia | ✅ | ✅ | ✅ |
| Explorar carpetas Drive | ❌ | ❌ | ❌ | ✅ |
| Consultar trabajos | Solo propios | ✅ | ✅ | ✅ |
| Crear/cancelar/reintentar trabajos | Solo propios | ❌ | ❌ | ✅ |
| Consultar almacenamiento | ❌ | ✅ | ❌ | ✅ |
| Descargar documento ajeno | ❌ | ❌ | ❌ | ✅ |
| Consultar auditoría completa | ❌ | ✅ | ❌ | ✅ |
| Consultar auditoría operacional | ❌ | ❌ | ✅ | ❌ |
| Publicar política | ❌ | ❌ | ❌ | ✅ |

\* Salvo el administrador principal y la propia cuenta.
