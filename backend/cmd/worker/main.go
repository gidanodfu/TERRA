// Comando worker reclama trabajos de descarga desde PostgreSQL y transfiere documentos.
// Es un proceso independiente y nunca sirve HTTP.
package main

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"syscall"

	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/platform/config"
	"terra/internal/platform/crypto"
	"terra/internal/platform/db"
	"terra/internal/platform/googleoauth"
	"terra/internal/platform/logx"
	"terra/internal/platform/migrate"
	"terra/internal/storage"
	"terra/migrations"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		os.Stderr.WriteString("configuration error: " + err.Error() + "\n")
		os.Exit(1)
	}
	log := logx.New("worker", cfg.Env)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database_unavailable", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if _, err := migrate.Up(ctx, pool, migrations.FS); err != nil {
		log.Error("migration_failed", "error", err)
		os.Exit(1)
	}

	store, err := storage.New(cfg.StorageRoot, cfg.Limits.MinFreeDiskBytes)
	if err != nil {
		log.Error("storage_unavailable", "error", err)
		os.Exit(1)
	}
	box, err := crypto.NewBox(cfg.TokenKey)
	if err != nil {
		log.Error("token_key_invalid", "error", err)
		os.Exit(1)
	}

	downloadRepo := downloads.NewRepository(pool)
	driveRepo := drive.NewRepository(pool)
	provider := drive.NewProvider(googleoauth.New(cfg), box)
	worker := downloads.NewWorker(cfg, downloadRepo, driveRepo, provider, store, log)

	err = worker.Run(ctx)
	if err != nil && !errors.Is(err, context.Canceled) {
		log.Error("worker_stopped", "error", err)
		os.Exit(1)
	}
	log.Info("worker_stopped")
}
