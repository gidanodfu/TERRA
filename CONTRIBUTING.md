# Contribuir a TERRA

## Reglas de trabajo

1. Lee `docs/implementation/PLAN.md` y los ADR aplicables antes de cambiar arquitectura.
2. La API y el worker comparten dominio, pero **no** se mezclan sus puntos de entrada.
3. No agregue contenedores. El límite es exactamente `web`, `api`, `worker`, `db`.
4. No agregue dependencias sin justificarlas en un ADR o en el PR.
5. Los secretos viven en `.env` (no versionado). Nunca escriba tokens, cookies o contraseñas en logs.
6. Toda entrada del usuario se valida en el servidor.
7. Toda operación administrativa sensible debe registrar auditoría.
8. Mantenga sincronizados `docs/api/openapi.yaml`, los diagramas y el código.

## Desarrollo

```bash
# Backend
cd backend && go test ./... && go vet ./...

# Frontend
cd frontend && npm ci && npm run build

# Stack completo
mkdir -p data/dev/staging data/dev/areas
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.dev.yaml up -d --build
```

Las migraciones son inmutables una vez aplicadas. Cambios de esquema se agregan como un
nuevo archivo numerado en `backend/migrations/`.

## Pruebas

- Unitarias sin Docker: `cd backend && go test ./...`.
- Integración con PostgreSQL/Google se ejecutan manualmente y se documentan en
  `docs/testing/test-cases.md`.
- Nunca use credenciales personales reales en CI. Use cuentas de prueba y dobles de Drive.

## Estilo

- Go: `gofmt`, errores tipados (`apperr`), `context.Context` propagado, interfaces pequeñas.
- React: componentes funcionales, separación `features/`, sin lógica de autorización definitiva en el navegador.
- SQL: migraciones con restricciones e índices; sin borrados en cascada del historial documental.

## Checklist de PR

- [ ] Pruebas ejecutadas y resultados reales incluidos.
- [ ] Sin secretos nuevos en el repositorio.
- [ ] Permisos verificados en backend.
- [ ] Auditoría agregada si la operación es sensible.
- [ ] Documentación y OpenAPI actualizados.
- [ ] Cuatro servicios conservados.
