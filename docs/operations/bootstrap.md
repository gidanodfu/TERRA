# Bootstrap

## Objetivo

Crear el primer administrador local y las estructuras técnicas necesarias **una sola vez**,
sin duplicar ni sobrescribir credenciales.

## Comando

```bash
./deploy/scripts/bootstrap.sh dev
```

Se ejecuta dentro del contenedor `api` existente (`/app/bootstrap`). No crea servicios.

## Requisitos

- PostgreSQL activo y saludable.
- API activa.
- Migraciones aplicadas.
- Almacenamiento disponible.
- `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` si aún no existe administrador.
- Contraseña de al menos 12 caracteres.

## Comportamiento

1. Valida configuración.
2. Conecta a PostgreSQL.
3. Aplica migraciones pendientes (idempotente).
4. Verifica/crea directorios técnicos.
5. Busca el username en `local_credentials`.
6. Si ya existe: no lo modifica y registra `bootstrap_admin_exists`.
7. Si no existe: crea usuario activo, rol `admin`, hash Argon2id y
   `must_rotate_password=true`.
8. Registra `bootstrap_state`.
9. Si `BOOTSTRAP_ADMIN_USERNAME` está vacío, omite la creación.

## Idempotencia

```bash
./deploy/scripts/bootstrap.sh dev
./deploy/scripts/bootstrap.sh dev
```

La segunda ejecución no cambia la contraseña ni crea otro administrador. La API y el worker
pueden reiniciarse libremente; el bootstrap no se ejecuta automáticamente en `up.sh`.

## Primer acceso

- Inicie sesión con el username/password configurados.
- El SPA fuerza el cambio de contraseña (`must_rotate_password=true`).
- Después del cambio, las demás sesiones se invalidan.

## Si falla

| Síntoma | Acción |
|---|---|
| PostgreSQL no disponible | `status.sh`, `logs.sh dev db` |
| Migraciones ausentes | `migrate.sh dev up` |
| Almacenamiento ausente | Revisar `STORAGE_HOST_PATH_PROD` y permisos 10001 |
| Contraseña rechazada | ≥12 caracteres, no placeholders |
| Administrador no creado | Revisar variables `BOOTSTRAP_ADMIN_*` |

## Seguridad

- No se muestra ni registra la contraseña.
- Solo se almacena el hash Argon2id.
- No se sobrescribe una contraseña existente.
- El bootstrap no acepta políticas ni conecta Google Drive por el trabajador.
- La contraseña inicial debe rotarse y no reutilizarse.
