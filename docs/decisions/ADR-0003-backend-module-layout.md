# ADR-0003 — Módulos por capacidad con capas a nivel de archivo

Estado: aceptado.

## Contexto

La especificación propone subcarpetas `domain/application/infrastructure/transport` por módulo. En
Go, paquetes diminutos con una sola función generan ciclos y abstracciones vacías.

## Decisión

Un paquete por capacidad (`auth`, `users`, `organization`, `drive`, `downloads`, `storage`, `admin`,
`audit`, `platform`), con capas separadas por archivos:

- `domain.go` — tipos y constantes;
- `repository.go` — SQL/adaptador de persistencia;
- `service.go` — casos de uso y reglas de negocio;
- `handler.go` — transporte HTTP;
- `worker.go` — proceso asíncrono en `downloads`.

Dependencias dirigidas: handlers → servicios → repositorios → plataforma. `server` cablea todo.
`principal` evita ciclos entre autorización y dominio. `drive` no decide autorización
administrativa; `downloads` la aplica.

## Consecuencias

- Paquetes cohesionados y testeables sin Docker.
- Sin dependencias circulares.
- La separación es visible por archivo y no por carpetas vacías.
- Si un módulo crece, se puede dividir en subpaquetes sin cambiar contratos.
