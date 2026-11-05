// Comando bootstrap aplica migraciones, prepara el almacenamiento y crea el primer
// administrador una sola vez. Ejecutarlo de nuevo nunca sobrescribe credenciales.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"

	"terra/internal/bootstrap"
	"terra/internal/platform/config"
	"terra/internal/platform/db"
	"terra/internal/platform/logx"
	"terra/internal/platform/migrate"
	"terra/internal/platform/password"
	"terra/internal/storage"
	"terra/migrations"
)

func main() {
	log := logx.New("bootstrap", "development")
	if err := run(log); err != nil {
		log.Error("bootstrap_failed", "error", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log = logx.New("bootstrap", cfg.Env)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("postgresql: %w", err)
	}
	defer pool.Close()

	applied, err := migrate.Up(ctx, pool, migrations.FS)
	if err != nil {
		return err
	}
	log.Info("migrations_applied", "count", len(applied), "files", applied)

	store, err := storage.NewReadOnly(cfg.StorageRoot, cfg.Limits.MinFreeDiskBytes)
	if err != nil {
		return err
	}
	log.Info("storage_ready", "root", store.Root())

	username := strings.TrimSpace(cfg.Bootstrap.Username)
	if username == "" {
		log.Warn("bootstrap_admin_skipped", "reason", "BOOTSTRAP_ADMIN_USERNAME is empty")
		return nil
	}
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM local_credentials WHERE lower(username)=lower($1))`,
		username).Scan(&exists); err != nil {
		return err
	}
	if exists {
		if err := bootstrap.EnsureExistingPrincipal(ctx, pool, username, log); err != nil {
			return err
		}
		log.Info("bootstrap_admin_exists", "username", username, "action", "left_untouched")
		return nil
	}
	if err := password.ValidateStrength(cfg.Bootstrap.Password); err != nil {
		return fmt.Errorf("BOOTSTRAP_ADMIN_PASSWORD too weak: %w", err)
	}
	hash, err := password.Hash(cfg.Bootstrap.Password)
	if err != nil {
		return err
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	userID := uuid.New()
	if _, err := tx.Exec(ctx, `INSERT INTO users (id, display_name, status) VALUES ($1,$2,'active')`,
		userID, username); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO local_credentials (user_id, username, password_hash, must_rotate_password)
		VALUES ($1,$2,$3,true)`, userID, username, hash); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_roles (user_id, role_id)
		SELECT $1, id FROM system_roles WHERE key='admin'`, userID); err != nil {
		return err
	}
	details, _ := json.Marshal(map[string]any{"admin_user_id": userID.String(), "username": username})
	if _, err := tx.Exec(ctx, `INSERT INTO bootstrap_state (id, details) VALUES (1,$1)
		ON CONFLICT (id) DO UPDATE SET completed_at=now(), details=$1`, details); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	log.Info("bootstrap_admin_created", "username", username, "must_rotate_password", true)
	return nil
}
