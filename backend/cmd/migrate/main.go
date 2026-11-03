// Command migrate applies embedded migrations and reports their state.
// It runs inside the existing api container; it is not a separate service.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"terra/internal/platform/config"
	"terra/internal/platform/db"
	"terra/internal/platform/logx"
	"terra/internal/platform/migrate"
	"terra/migrations"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "configuration error:", err)
		os.Exit(1)
	}
	log := logx.New("migrate", cfg.Env)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database_unavailable", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	applied, err := migrate.Up(ctx, pool, migrations.FS)
	if err != nil {
		log.Error("migration_failed", "error", err)
		os.Exit(1)
	}
	if len(applied) == 0 {
		log.Info("migrations_up_to_date")
		return
	}
	log.Info("migrations_applied", "files", applied)
}
