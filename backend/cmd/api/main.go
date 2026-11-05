// Comando api sirve la API REST de TERRA y los endpoints SSE.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"terra/internal/admin"
	"terra/internal/audit"
	"terra/internal/auth"
	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/organization"
	"terra/internal/platform/config"
	"terra/internal/platform/crypto"
	"terra/internal/platform/db"
	"terra/internal/platform/googleoauth"
	"terra/internal/platform/logx"
	"terra/internal/platform/migrate"
	"terra/internal/platform/oauthstate"
	"terra/internal/server"
	"terra/internal/storage"
	"terra/internal/users"
	"terra/migrations"
)

var (
	buildVersion = "dev"
	buildTime    = "unknown"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("configuration_error", "error", err)
		os.Exit(1)
	}
	log := logx.New("api", cfg.Env)
	log.Info("api_starting", "version", buildVersion, "build_time", buildTime, "env", cfg.Env)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database_unavailable", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if applied, err := migrate.Up(ctx, pool, migrations.FS); err != nil {
		log.Error("migration_failed", "error", err)
		os.Exit(1)
	} else if len(applied) > 0 {
		log.Info("migrations_applied", "files", applied)
	}

	store, err := storage.NewReadOnly(cfg.StorageRoot, cfg.Limits.MinFreeDiskBytes)
	if err != nil {
		log.Error("storage_unavailable", "error", err)
		os.Exit(1)
	}
	box, err := crypto.NewBox(cfg.TokenKey)
	if err != nil {
		log.Error("token_key_invalid", "error", err)
		os.Exit(1)
	}

	auditRepo := audit.NewRepository(pool)
	usersRepo := users.NewRepository(pool)
	orgRepo := organization.NewRepository(pool)
	authRepo := auth.NewRepository(pool)
	driveRepo := drive.NewRepository(pool)
	downloadRepo := downloads.NewRepository(pool)

	states := oauthstate.NewRepository(pool)
	google := googleoauth.New(cfg)
	provider := drive.NewProvider(google, box)

	usersSvc := users.NewService(usersRepo, orgRepo, auditRepo)
	orgSvc := organization.NewService(orgRepo, auditRepo)
	driveSvc := drive.NewService(cfg, driveRepo, usersRepo, google, states, provider, box, auditRepo)
	turnstile := &auth.Turnstile{
		SecretKey: cfg.Turnstile.SecretKey, Hostname: cfg.Turnstile.Hostname,
		Action: cfg.Turnstile.Action, VerifyURL: cfg.Turnstile.VerifyURL,
		Logger: log,
	}
	authSvc := auth.NewService(cfg, authRepo, usersRepo, google, states, turnstile, auditRepo)
	downloadSvc := downloads.NewService(cfg, downloadRepo, driveSvc, usersRepo, store, auditRepo)
	adminSvc := admin.NewService(pool, usersRepo, orgRepo, auditRepo, driveRepo, downloadRepo)

	handler := server.New(cfg, log, pool, server.Handlers{
		Auth:     auth.NewHandler(authSvc, cfg.SessionSecret),
		Users:    users.NewHandler(usersSvc, cfg.SessionSecret),
		Org:      organization.NewHandler(orgSvc, cfg.SessionSecret),
		Drive:    drive.NewHandler(driveSvc, cfg.SessionSecret),
		Download: downloads.NewHandler(downloadSvc, downloadRepo, cfg, cfg.SessionSecret),
		Admin:    admin.NewHandler(adminSvc, cfg.SessionSecret),
	})

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      0, // SSE streams stay open
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Info("api_listening", "addr", srv.Addr, "env", cfg.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("api_failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown_failed", "error", err)
	}
	log.Info("api_stopped")
}
