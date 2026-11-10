// El paquete config centraliza cada ajuste de TERRA basado en variables de entorno.
package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env            string
	PublicURL      string
	APIInternalURL string
	DatabaseURL    string
	SessionSecret  string
	SessionCookie  string
	SessionTTL     time.Duration
	Google         Google
	TokenKey       []byte
	Turnstile      Turnstile
	StorageRoot    string
	DownloadMinGap time.Duration
	Worker         Worker
	Limits         Limits
	Bootstrap      Bootstrap
}

type Google struct {
	ClientID         string
	ClientSecret     string
	RedirectURL      string
	DriveRedirectURL string
	DriveScopes      []string
}

type Turnstile struct {
	SiteKey   string
	SecretKey string
	Hostname  string
	Action    string
	VerifyURL string
}

type Worker struct {
	Concurrency           int
	PerAccountConcurrency int
	Lease                 time.Duration
	Heartbeat             time.Duration
	ProgressInterval      time.Duration
}

type Limits struct {
	MaxDownloadBytes     int64
	MaxJobBytes          int64
	MaxUserStorageBytes  int64
	MaxAreaStorageBytes  int64
	MaxActiveJobsGlobal  int
	MaxActiveJobsPerUser int
	MinFreeDiskBytes     int64
	RetentionDays        int
}

type Bootstrap struct {
	Username string
	Password string
}

func (c Config) IsProduction() bool { return c.Env == "production" }

// Load lee y valida el entorno. La ausencia de valores obligatorios es fatal:
// TERRA nunca debe arrancar con una configuración de seguridad degradada silenciosamente.
func Load() (Config, error) {
	dsn, err := databaseURL()
	if err != nil {
		return Config{}, err
	}
	c := Config{
		Env:            env("APP_ENV", "development"),
		PublicURL:      strings.TrimRight(env("APP_PUBLIC_URL", "http://localhost:8080"), "/"),
		APIInternalURL: env("API_INTERNAL_URL", "http://api:8080"),
		DatabaseURL:    dsn,
		SessionSecret:  os.Getenv("SESSION_SECRET"),
		SessionCookie:  env("SESSION_COOKIE_NAME", "terra_session"),
		SessionTTL:     time.Duration(envInt("SESSION_TTL_HOURS", 12)) * time.Hour,
		Google: Google{
			ClientID:         os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret:     os.Getenv("GOOGLE_CLIENT_SECRET"),
			RedirectURL:      os.Getenv("GOOGLE_REDIRECT_URL"),
			DriveRedirectURL: os.Getenv("GOOGLE_DRIVE_REDIRECT_URL"),
			DriveScopes:      splitScopes(env("GOOGLE_DRIVE_SCOPES", "https://www.googleapis.com/auth/drive.readonly")),
		},
		Turnstile: Turnstile{
			SiteKey:   os.Getenv("TURNSTILE_SITE_KEY"),
			SecretKey: os.Getenv("TURNSTILE_SECRET_KEY"),
			Hostname:  os.Getenv("TURNSTILE_HOSTNAME"),
			Action:    env("TURNSTILE_ACTION", "admin_login"),
			VerifyURL: env("TURNSTILE_VERIFY_URL", "https://challenges.cloudflare.com/turnstile/v0/siteverify"),
		},
		StorageRoot:    env("STORAGE_ROOT", "/var/lib/terra"),
		DownloadMinGap: time.Duration(envInt("DOWNLOAD_MIN_INTERVAL_MS", 1500)) * time.Millisecond,
		Worker: Worker{
			Concurrency:           envInt("WORKER_CONCURRENCY", 3),
			PerAccountConcurrency: envInt("WORKER_PER_ACCOUNT_CONCURRENCY", 2),
			Lease:                 time.Duration(envInt("WORKER_LEASE_SECONDS", 180)) * time.Second,
			Heartbeat:             time.Duration(envInt("WORKER_HEARTBEAT_SECONDS", 10)) * time.Second,
			ProgressInterval:      time.Duration(envInt("PROGRESS_INTERVAL_MS", 400)) * time.Millisecond,
		},
		Limits: Limits{
			MaxDownloadBytes:     envInt64("MAX_DOWNLOAD_BYTES", 5<<30),
			MaxJobBytes:          envInt64("MAX_JOB_BYTES", 50<<30),
			MaxUserStorageBytes:  envInt64("MAX_USER_STORAGE_BYTES", 100<<30),
			MaxAreaStorageBytes:  envInt64("MAX_AREA_STORAGE_BYTES", 500<<30),
			MaxActiveJobsGlobal:  envInt("MAX_ACTIVE_JOBS_GLOBAL", 4),
			MaxActiveJobsPerUser: envInt("MAX_ACTIVE_JOBS_PER_USER", 1),
			MinFreeDiskBytes:     envInt64("MIN_FREE_DISK_BYTES", 10<<30),
			RetentionDays:        envInt("RETENTION_DAYS", 0),
		},
		Bootstrap: Bootstrap{
			Username: os.Getenv("BOOTSTRAP_ADMIN_USERNAME"),
			Password: os.Getenv("BOOTSTRAP_ADMIN_PASSWORD"),
		},
	}

	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(os.Getenv("TOKEN_ENCRYPTION_KEY")))
	if err != nil || len(key) != 32 {
		return Config{}, errors.New("TOKEN_ENCRYPTION_KEY must be base64-encoded 32 bytes (openssl rand -base64 32)")
	}
	c.TokenKey = key

	var missing []string
	for name, value := range map[string]string{
		"SESSION_SECRET":            c.SessionSecret,
		"GOOGLE_CLIENT_ID":          c.Google.ClientID,
		"GOOGLE_CLIENT_SECRET":      c.Google.ClientSecret,
		"GOOGLE_REDIRECT_URL":       c.Google.RedirectURL,
		"GOOGLE_DRIVE_REDIRECT_URL": c.Google.DriveRedirectURL,
	} {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required configuration: %s", strings.Join(missing, ", "))
	}
	if len(c.SessionSecret) < 32 {
		return Config{}, errors.New("SESSION_SECRET must be at least 32 characters")
	}
	if c.Worker.Concurrency < 1 || c.Worker.PerAccountConcurrency < 1 {
		return Config{}, errors.New("worker concurrency values must be >= 1")
	}
	if c.DownloadMinGap < 0 {
		return Config{}, errors.New("DOWNLOAD_MIN_INTERVAL_MS cannot be negative")
	}
	if c.IsProduction() {
		if !strings.HasPrefix(c.PublicURL, "https://") {
			return Config{}, errors.New("APP_PUBLIC_URL must be https in production")
		}
		if c.Turnstile.SecretKey == "" || c.Turnstile.SiteKey == "" {
			return Config{}, errors.New("Turnstile keys are mandatory in production")
		}
	}
	return c, nil
}

// databaseURL construye el DSN interno a partir de la única fuente de verdad de
// credenciales (POSTGRES_*), codificando usuario y contraseña con net/url. Solo si
// esas variables no existen se acepta DATABASE_URL como compatibilidad heredada.
func databaseURL() (string, error) {
	user := strings.TrimSpace(os.Getenv("POSTGRES_USER"))
	name := strings.TrimSpace(os.Getenv("POSTGRES_DB"))
	password := os.Getenv("POSTGRES_PASSWORD")
	if user == "" && name == "" {
		legacy := strings.TrimSpace(os.Getenv("DATABASE_URL"))
		if legacy == "" {
			return "", errors.New("missing required configuration: POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD")
		}
		return legacy, nil
	}
	if user == "" || name == "" || password == "" {
		return "", errors.New("POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB must all be set")
	}
	host := env("DATABASE_HOST", "db")
	port := env("DATABASE_PORT", "5432")
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(user, password),
		Host:     net.JoinHostPort(host, port),
		Path:     "/" + name,
		RawQuery: "sslmode=disable",
	}
	return u.String(), nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func envInt64(key string, fallback int64) int64 {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return fallback
}

func splitScopes(raw string) []string {
	fields := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ' ' })
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if f = strings.TrimSpace(f); f != "" {
			out = append(out, f)
		}
	}
	return out
}
