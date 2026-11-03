# ADR-0002 — OAuth External y scope drive.readonly

Estado: aceptado.

## Contexto

Los trabajadores usan cuentas personales de Google. No hay Google Workspace, delegación de dominio
ni unidades compartidas institucionales. La aplicación debe recorrer Mi unidad completa y descargar
documentos nativos.

## Decisión

- Cliente OAuth **External**.
- Login con `openid email profile`.
- Autorización documental con `https://www.googleapis.com/auth/drive.readonly`.
- No se usa `drive.file`, cuenta de servicio ni delegación.

`drive.file` solo cubre archivos creados o seleccionados mediante Google Picker y no garantiza el
recorrido recursivo de Mi unidad ni los archivos preexistentes.

## Consecuencias

- Se requiere verificación de Google para un scope restringido antes de uso general.
- El consentimiento debe explicar que TERRA solo lee.
- La app debe manejar `reauthorization_required` y bloqueos de trabajos.
- Mientras no haya verificación, solo usuarios de prueba pueden autorizar la app.
- No se debe afirmar que Google aprobó TERRA.
- Se solicita también `openid email` en el flujo de Drive para verificar que la cuenta autorizada
  coincide con la identidad de la sesión.

## Alternativas descartadas

- `drive.file`: alcance funcional insuficiente.
- Service account con delegación: requiere Workspace, inexistente.
- Picker para selección manual: no cumple Mi unidad completa ni exploración del árbol.
