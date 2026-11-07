# Contribuir a TERRA

## Reglas de trabajo

1. Lee [docs/README.md](docs/README.md), [docs/implementation/PLAN.md](docs/implementation/PLAN.md) y los ADR aplicables.
2. La API y el worker comparten dominio, pero **no** se mezclan sus puntos de entrada.
3. No agregue contenedores. El límite es exactamente `web`, `api`, `worker`, `db`.
4. No agregue dependencias sin justificarlas en un ADR o en el PR.
5. Los secretos viven en `.env` (no versionado). Nunca escriba tokens, cookies o contraseñas en logs.
6. Toda entrada del usuario se valida en el servidor siguiendo [docs/development/form-validation.md](docs/development/form-validation.md).
7. Toda operación administrativa sensible debe registrar auditoría.
8. Toda funcionalidad nueva debe incluir pruebas unitarias y, si aplica, de integración.
9. Mantenga sincronizados `docs/api/openapi.yaml`, los diagramas y el código.
10. Docker es el único entorno de ejecución; no agregue pasos que requieran Go o Node en el host.

## Desarrollo

```bash
./terra init
./terra status
./terra logs api
./terra shell api
```

Opere siempre mediante `./terra` o los scripts de `deploy/scripts/`. No agregue comandos
de despliegue productivo ni archivos Compose alternativos. La referencia canónica
de comandos es
[docs/development/commands-reference.md](docs/development/commands-reference.md).

Las migraciones son inmutables una vez aplicadas. Los cambios de esquema se agregan
como un nuevo archivo numerado en `backend/migrations/`.

## Pruebas

```bash
./terra test backend unit
./terra test backend integration
./terra test frontend unit
./terra test frontend integration
./terra test e2e
./terra test all
```

Las pruebas se ejecutan dentro de los contenedores. La integración de PostgreSQL usa
la base temporal `terra_test`; nunca la base de desarrollo. Las pruebas que requieran
Google/Turnstile reales son manuales, opt-in y no deben usar credenciales personales
en CI.

Documentación: [docs/development/testing.md](docs/development/testing.md).

## Estilo

- Go: `gofmt`, errores tipados (`apperr`), `context.Context` propagado, interfaces pequeñas.
- React: componentes funcionales, separación `features/`, sin lógica de autorización definitiva en el navegador.
- SQL: migraciones con restricciones e índices; sin borrados en cascada del historial documental.
- Infraestructura: un único `deploy/compose.yaml` y scripts bajo `deploy/scripts/`.

## Idioma y estilo de documentación

1. Los comentarios explicativos del código deben redactarse en español.
2. La documentación del proyecto debe mantenerse en español.
3. Se conservan los términos técnicos establecidos y los nombres oficiales de tecnologías, protocolos, herramientas y productos.
4. No se traducen identificadores, rutas, variables, claves, códigos de error, comandos, contratos de API ni nombres de archivos.
5. Los nuevos módulos deben respetar estas convenciones desde su creación.
6. Toda modificación futura debe mantener la uniformidad lingüística del repositorio.

## Validación

Todo formulario nuevo, endpoint de escritura o caso de uso debe seguir el
[estándar de validación de formularios](docs/development/form-validation.md). Las
reglas de negocio se validan en el backend, nunca solo en React. Los errores de
validación usan HTTP 422 con `fields` y los conflictos reales usan HTTP 409.

## Lista de verificación del PR

- [ ] `./terra test all` ejecutado y resultados reales incluidos.
- [ ] Sin secretos nuevos en el repositorio.
- [ ] Sin archivos `.env.production`/staging ni instrucciones de despliegue.
- [ ] Permisos verificados en backend.
- [ ] Auditoría agregada si la operación es sensible.
- [ ] Validación de backend y frontend según el estándar.
- [ ] Documentación, OpenAPI y `docs/development/` actualizados.
- [ ] Cuatro servicios conservados.
- [ ] Contenedores e imágenes no incluyen `.git` ni credenciales.
