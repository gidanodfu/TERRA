# Introducción y primeros pasos

TERRA es un sistema de gestión documental que conserva copias controladas de
Google Drive clasificadas por **área → cargo → trabajador → snapshot**. La
aplicación se ejecuta en cuatro contenedores Docker (`web`, `api`, `worker`,
`db`).

## Antes de empezar

1. Docker Engine o Docker Desktop con Docker Compose v2.
2. El archivo `.env` creado desde `.env.example` y completado.
3. Las credenciales OAuth configuradas en Google Cloud. Consulte
   [Google Cloud, OAuth 2.0 y Google Drive](../integrations/google-cloud-drive-oauth.md).
4. Turnstile configurado para el acceso administrativo local.

```bash
cp .env.example .env
chmod 600 .env
./terra check
./terra init
```

La instalación aplica migraciones y crea el administrador principal de forma
idempotente. Consulte la
[referencia de comandos](../development/commands-reference.md) para el resto de
operaciones.

## Acceso

```text
http://localhost:8080
```

El puerto se controla con `WEB_PORT`.

## Formas de acceso

| Cuenta | Método |
|---|---|
| Trabajador | **Continuar con Google** con una cuenta Google verificada. |
| Administrador, moderador y solo lectura | Usuario y contraseña locales, Turnstile y cambio obligatorio de la contraseña inicial. |

Un trabajador nuevo puede quedar en estado `pending_profile` hasta completar
nombres, apellidos, área y cargo en la pantalla de configuración inicial.

## Roles

| Rol | Alcance |
|---|---|
| `admin` | Administración integral: trabajadores, cuentas administrativas, organización, conexiones Drive, descargas, trabajos, almacenamiento, política y auditoría completa. |
| `moderator` | Gestión operativa de trabajadores, consulta de organización, conexiones y trabajos, y auditoría operacional. |
| `read_only` | Consulta de trabajadores, organización, conexiones, trabajos, almacenamiento y auditoría completa, sin escritura. |
| `user` | Recursos propios: perfil, conexión de Drive, descargas, documentos y seguridad. |

Los permisos efectivos se resuelven en el backend. La navegación solo oculta los
módulos que la cuenta no puede usar; no sustituye la autorización del servidor.

## Siguientes pasos

- [Trabajadores](workers.md)
- [Administradores](administrators.md)
- [Moderadores](moderators.md)
- [Solo lectura](read-only.md)
- [Conexión de Google Drive](google-drive.md)
- [Documentos y descargas](documents-and-downloads.md)
