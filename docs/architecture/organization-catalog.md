# Catálogo organizativo

## Modelo

- **Área**: unidad organizativa de nivel superior. Tiene nombre visible, slug técnico,
  estado, responsabilidades descriptivas y relaciones con cargos y trabajadores.
- **Cargo**: puesto dentro de un área. Tiene nombre, slug, estado y responsabilidades
  propias. Un mismo título puede existir en áreas distintas.

## Unicidad

### Áreas

`areas.normalized_name` es único globalmente, incluido el estado inactivo. Desactivar
un área no libera su nombre.

La normalización canónica:

1. recorta extremos;
2. colapsa espacios consecutivos;
3. convierte a minúsculas;
4. compone Unicode en NFC.

Los acentos siguen siendo significativos: `Recursos Humanos` y `Recursos Humanós` son
nombres distintos. `Recursos Humanos`, `recursos humanos` y `  Recursos   Humanos ` son
el mismo nombre.

La función PostgreSQL `terra_normalize_org_name` y `validate.NormalizeName` aplican la
misma regla. Un trigger mantiene `normalized_name` en cada inserción o cambio de nombre.

### Cargos

`UNIQUE (area_id, normalized_name)`: el nombre es único dentro de su área y se conserva
aunque el cargo esté inactivo. El mismo nombre puede repetirse en otra área.

La base de datos es la autoridad final. Las comprobaciones del servicio mejoran el
mensaje, pero la restricción impide duplicados concurrentes.

## Errores funcionales

- `area_exists`: área duplicada; incluye el campo `name`.
- `position_exists`: cargo duplicado dentro del área; incluye el campo `name`.

Los conflictos de PostgreSQL se traducen por SQLSTATE `23505` y el nombre exacto de la
constraint, nunca por búsqueda de texto.

## Responsabilidades

`areas.responsibilities` y `positions.responsibilities` son `text[] NOT NULL DEFAULT '{}'`.

Límites:

- máximo 20 elementos;
- máximo 300 caracteres por elemento;
- sin elementos vacíos;
- sin duplicados normalizados dentro de la misma lista;
- lista vacía permitida.

Las responsabilidades son descriptivas. **No son permisos de sistema** y no modifican
RBAC, roles ni autorización.

## Migración 0009

- agrega normalización y responsabilidades;
- regenera los nombres normalizados;
- conserva snapshots de nombres históricos antes de remapear;
- consolida áreas duplicadas de forma determinista;
- remapea cargos, trabajadores, trabajos e historial;
- falla de forma transaccional si encuentra conflictos de responsabilidades;
- crea la restricción única final de áreas.

No se eliminan snapshots ni documentos. Los nombres visibles de trabajos se conservan.
