# Migraciones

## Modelo

- Migraciones SQL versionadas en `backend/migrations/000N_*.sql`.
- Se embeben en el binario con `go:embed`.
- Se aplican en orden lexicográfico.
- Cada archivo se ejecuta en una transacción.
- Un **advisory lock** de PostgreSQL serializa ejecuciones concurrentes.
- `schema_migrations` registra versión y fecha.
- No hay contenedor de migraciones: se ejecutan dentro de `api`.

## Comandos

```bash
./deploy/scripts/migrate.sh dev status
./deploy/scripts/migrate.sh dev version
./deploy/scripts/migrate.sh dev up
```

`up` ejecuta `/app/migrate` dentro del contenedor API. La API también aplica migraciones al
arrancar; por tanto, un `up.sh` normal deja el esquema al día.

## Ver estado

```bash
./deploy/scripts/migrate.sh dev status
```

Salida:

```
0001_init.sql | 2026-11-03 17:05:08
...
```

## Cuándo se aplican

- En cada arranque de API y worker (idempotente).
- Explícitamente con `migrate.sh up`.
- Nunca desde un contenedor adicional ni desde un script fuera de Docker.

## Añadir una migración

1. Crear `backend/migrations/0005_descripcion.sql`.
2. Usar SQL idempotente cuando sea posible (`IF NOT EXISTS`).
3. Añadir restricciones e índices.
4. Probar en desarrollo:

```bash
./deploy/scripts/build.sh dev api worker
./deploy/scripts/up.sh dev
./deploy/scripts/migrate.sh dev status
./deploy/scripts/test.sh dev integration
```

5. Documentar el cambio y actualizar `docs/architecture/database-design.md`.
6. En producción: backup previo, ventana de mantenimiento, `migrate.sh prod up` y verificación.

## Rollback

No se incluyen migraciones `down` y **no se ejecuta rollback automático**. Para revertir:

1. detener worker;
2. backup;
3. aplicar un script SQL revisado;
4. verificar integridad;
5. reactivar worker.

Si el esquema es incompatible, restaurar el backup completo (BD + documentos + clave).

## Reglas

- No modificar una migración ya aplicada en producción.
- No borrar historia documental en una migración.
- No usar `DROP ... CASCADE` sobre tablas de auditoría o documentos.
- Probar siempre con un backup reciente.
