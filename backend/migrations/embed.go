// Package migrations embeds the SQL migrations applied by the API and bootstrap entrypoints.
package migrations

import "embed"

// FS holds every ordered migration file.
//
//go:embed *.sql
var FS embed.FS
