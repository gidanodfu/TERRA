# Despliegue en producción (resumen)

La guía completa está en [production-deployment.md](production-deployment.md).

## Comandos oficiales

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# completar valores reales

sudo mkdir -p /srv/terra-data/prod/{staging,areas}
sudo chown -R 10001:10001 /srv/terra-data/prod

./deploy/scripts/check.sh prod
./deploy/scripts/build.sh prod
./deploy/scripts/init.sh prod --allow-empty-db
./deploy/scripts/status.sh prod
```

## Reglas

- No reutilizar `.env` de desarrollo.
- El proyecto Docker de producción es `terra-prod`; el de desarrollo es `terra`.
- PostgreSQL no se publica.
- TLS se termina en el proxy institucional.
- Restauración en producción requiere `CONFIRM_PROD="RESTORE PROD"`.
- No se declara TERRA verificada por Google hasta recibir la aprobación.
