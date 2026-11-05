# Inicialización

## Primera instalación

```bash
cp .env.example .env
chmod 600 .env
# completa los valores locales requeridos en .env
./terra init
```

`./terra init` es el único punto de entrada. Valida el entorno, prepara
el almacenamiento local, construye las imágenes faltantes, inicia PostgreSQL, aplica migraciones, ejecuta
el bootstrap del administrador, inicia worker y web, y verifica los cuatro servicios.

## Secuencia ejecutada

1. Validación de Docker y Compose.
2. Validación de `.env`, variables requeridas y placeholders.
3. Validación de Dockerfiles y de la estructura de Compose.
4. Exactamente cuatro servicios: `web`, `api`, `worker`, `db`.
5. Detección del volumen de PostgreSQL existente.
6. Preparación del almacenamiento local y de la caché de Go.
7. Construcción de imágenes cuando faltan, o con `--rebuild`.
8. `docker compose up -d db` y espera del healthcheck.
9. `docker compose up -d api`; la API aplica las migraciones.
10. Equivalente a `/app/migrate` mediante `go run ./cmd/migrate`.
11. Bootstrap mediante `go run ./cmd/bootstrap`.
12. `docker compose up -d worker web`.
13. Healthchecks y conectividad a través de Vite.
14. Resumen final sin secretos.

## Recuperación tras el borrado accidental de contenedores

```bash
./terra init
```

Si el volumen de PostgreSQL existe, se reutiliza. El bootstrap detecta el administrador
existente y no sobrescribe las credenciales. Los usuarios, jobs y documentos permanecen.

Para reconstruir también las imágenes:

```bash
./terra init --rebuild --no-cache
```

## Volumen faltante

Si el volumen no existe pero sí existen documentos o copias de seguridad, la inicialización se detiene.
No crea silenciosamente una base de datos vacía. Restaure una copia de seguridad local o use
`--allow-empty-db` solo después de confirmar que la pérdida es aceptable.

## Manejo de fallos

```bash
./terra doctor
./terra logs api
./terra logs db
```

El script se detiene ante fallos y nunca informa éxito para servicios no saludables.
La inicialización nunca elimina volúmenes.

## Arranque normal

```bash
./terra up
```

Use `init` para la primera instalación o la recuperación completa; use `up` para arranques rutinarios.
