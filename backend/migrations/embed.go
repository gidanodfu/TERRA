// El paquete migrations embebe las migraciones SQL aplicadas por los puntos de entrada de la API y bootstrap.
package migrations

import "embed"

// FS contiene todos los archivos de migración ordenados.
//
//go:embed *.sql
var FS embed.FS
