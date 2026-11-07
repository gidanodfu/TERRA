# Validación de formularios y datos

Estándar obligatorio para todo formulario, endpoint de escritura o caso de uso
nuevo. La autoridad de validación es el backend; React solo mejora la
experiencia.

## 1. Arquitectura de cuatro niveles

| Nivel | Responsable | Qué valida |
|---|---|---|
| 1. Frontend | Componente React | Campos visibles, formatos sencillos, límites de caracteres, mensajes junto al control y bloqueo durante el envío. |
| 2. Transporte HTTP | `backend/internal/platform/httpx` | `Content-Type: application/json`, cuerpo obligatorio, JSON válido, máximo 1 MB, campos desconocidos y contenido extra. |
| 3. Backend | Handler + service | Campos obligatorios, límites, enumeraciones, relaciones, estados, autorización, propiedad de recursos y reglas del caso de uso. |
| 4. PostgreSQL | Migraciones | `NOT NULL`, `UNIQUE`, `CHECK`, claves foráneas, restricciones compuestas e integridad transaccional. |

`httpx.Decode()` no comprueba campos obligatorios ni reglas de negocio. Que un
handler use `Decode()` no significa que el endpoint esté validado.

## 2. Contrato de una escritura

1. Defina un DTO tipado con etiquetas `json` explícitas.
2. Indique qué campos son obligatorios, opcionales y nulos.
3. Documente límites y formatos.
4. Decodifique con `httpx.Decode(w, r, &body)`.
5. Valide los datos en el service, no solo en el handler.
6. Compruebe autorización y propiedad del recurso.
7. Deje que PostgreSQL actúe como última garantía.
8. Devuelva errores estructurados con `apperr`.
9. Asocie `error.fields` en React.
10. Añada pruebas unitarias, de integración y E2E según el riesgo.
11. Actualice `docs/api/openapi.yaml` y esta guía si cambia el contrato.

No implemente validación automática por reflection ni un validador genérico que
desconozca el contexto del módulo. Las reglas de negocio deben leerse.

## 3. DTO y validación estructural

```go
type CreateAreaInput struct {
    Name             string   `json:"name"`
    Responsibilities []string `json:"responsibilities"`
}

func validateCreateArea(in CreateAreaInput) map[string]string {
    fields := map[string]string{}
    validate.Required(fields, "name", strings.TrimSpace(in.Name))
    validate.MaxLen(fields, "name", strings.TrimSpace(in.Name), 120)
    validate.MaxItems(fields, "responsibilities", in.Responsibilities, 20,
        "Puede registrar como máximo 20 responsabilidades.")
    return fields
}
```

El service devuelve el error con el mensaje funcional del módulo:

```go
if len(fields) > 0 {
    return nil, apperr.Invalid("Revise los datos del área.", fields)
}
```

## 4. Utilidades disponibles

`backend/internal/platform/validate`:

| Función | Uso |
|---|---|
| `Required` | Campo obligatorio después de recortar espacios. |
| `MaxLen` | Longitud máxima en runas Unicode. |
| `MaxItems` | Cantidad máxima de elementos de una lista. |
| `OneOf` | Enumeración cerrada con mensaje por campo. |
| `CleanText` | Recorta, colapsa espacios y compone NFC. |
| `NormalizeName` | Minúsculas, espacios colapsados y NFC para unicidad organizativa. |
| `Slug` / `IsSlug` | Identificador ASCII seguro para rutas y unicidad. |

Añada una utilidad solo cuando tenga al menos un consumidor real y mantenga las
reglas de negocio en el service.

## 5. Validaciones que dependen de PostgreSQL o de relaciones

Permanecen en el service o en el repositorio:

- unicidad real de nombre de área o cargo;
- pertenencia de un cargo a un área activa;
- existencia de conexión y política vigente;
- límites de capacidad;
- estado del trabajador;
- propiedad de un trabajo o documento;
- idempotencia de una descarga.

No duplique estas reglas en React. El frontend puede anticipar el mensaje, pero
el servidor debe volver a comprobarlo.

## 6. Errores de validación: HTTP 422

```json
{
  "error": {
    "code": "validation_error",
    "message": "Revise los campos indicados.",
    "fields": {
      "name": "Este campo es obligatorio.",
      "position_id": "Seleccione un cargo válido."
    }
  },
  "request_id": "..."
}
```

Reglas:

- `fields` usa exactamente el nombre JSON del campo.
- Los mensajes se redactan en español y no exponen SQL, rutas internas ni
  secretos.
- No convierta errores de autenticación, autorización, conflicto o capacidad en
  `validation_error`.
- Un conflicto real de persistencia conserva HTTP 409 con un código estable,
  por ejemplo `area_exists`, `position_exists`, `username_taken`,
  `policy_exists` o `cannot_suspend_self`.

## 7. Manejo en React

`frontend/src/services/api.js` convierte la respuesta en `ApiError` y conserva
`err.message`, `err.code`, `err.status` y `err.fields`.

Patrón obligatorio:

```jsx
const [errors, setErrors] = useState({})
const [error, setError] = useState('')

const update = (key, value) => {
  setForm((current) => ({ ...current, [key]: value }))
  setErrors((current) => ({ ...current, [key]: undefined }))
}

try {
  await api.patch('/me/profile', form)
} catch (err) {
  setError(err.message)
  if (err.fields) setErrors(err.fields)
}
```

Requisitos:

- Mostrar el mensaje general cuando exista.
- Asociar cada error a su control con `Field error={errors.campo}`.
- Conservar los datos introducidos tras un error.
- Limpiar solo el error del campo modificado.
- Bloquear el botón mientras la solicitud está en curso.
- No volver a enviar si ya hay una solicitud activa.

## 8. Pruebas mínimas

### Unitarias

- utilidades de validación y normalización;
- funciones puras del dominio.

### Integración de backend

Invoque handlers o services sin React y compruebe:

- petición válida;
- campo ausente, vacío o solo con espacios;
- longitud fuera de rango;
- enumeración inválida;
- UUID inválido;
- relación inexistente;
- estado incompatible;
- conflicto de unicidad;
- usuario sin permiso;
- recurso de terceros;
- selección fuera de límites;
- JSON desconocido, demasiado grande o `Content-Type` incorrecto.

### Integración de frontend

- mensaje de campo procedente de `err.fields`;
- mensaje general;
- datos conservados;
- botón bloqueado durante el envío;
- formulario válido sin regresiones.

### E2E

- flujo real de la pantalla con API simulada o entorno controlado;
- errores visibles y accesibles;
- ausencia de envíos duplicados.

Los ejemplos vivos están en
`backend/tests/integration/validation_bypass_test.go`,
`frontend/tests/integration/profile-form.test.jsx` y
`frontend/tests/integration/policy-validation.test.jsx`.

## 9. Integridad en PostgreSQL

No traslade toda la validación a la base de datos. Use restricciones para lo que
debe ser imposible persistir:

- `NOT NULL` y `CHECK` para estados y valores no vacíos;
- `UNIQUE` para nombres normalizados, slugs, username y versiones de política;
- claves foráneas, incluida la clave compuesta que impide asignar un cargo de
  otra área;
- transacciones para operaciones que abarcan varias tablas.

Cuando una restricción de PostgreSQL produzca un error de unicidad, tradúzcalo a
un 409 estable en el repositorio. No exponga el error SQL.

## 10. Lista de verificación para un formulario nuevo

- [ ] DTO tipado y campo JSON documentado.
- [ ] `httpx.Decode()` en el handler.
- [ ] Validación de campos y reglas en el service.
- [ ] Autorización y propiedad comprobadas en backend.
- [ ] Restricciones de PostgreSQL revisadas.
- [ ] `apperr.Invalid` con `fields` cuando corresponde.
- [ ] `err.fields` asociado en React.
- [ ] Datos conservados y envío bloqueado.
- [ ] Pruebas de integración de backend y frontend.
- [ ] OpenAPI y documentación actualizados.
