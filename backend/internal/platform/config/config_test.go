package config

import (
	"net/url"
	"testing"
)

func TestDatabaseURLBuildsFromPostgresVars(t *testing.T) {
	t.Setenv("POSTGRES_USER", "usuario")
	t.Setenv("POSTGRES_PASSWORD", "clave con @:/?% y espacios")
	t.Setenv("POSTGRES_DB", "terra")
	t.Setenv("DATABASE_HOST", "db")
	t.Setenv("DATABASE_PORT", "5432")
	t.Setenv("DATABASE_URL", "postgres://ignorado:ignorado@otro:1111/nada")

	raw, err := databaseURL()
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("DSN inválido: %v", err)
	}
	if u.Scheme != "postgres" || u.Host != "db:5432" || u.Path != "/terra" || u.RawQuery != "sslmode=disable" {
		t.Fatalf("DSN inesperado: %s", raw)
	}
	if u.User.Username() != "usuario" {
		t.Fatalf("usuario mal codificado: %s", u.User.Username())
	}
	password, _ := u.User.Password()
	if password != "clave con @:/?% y espacios" {
		t.Fatalf("contraseña mal codificada")
	}
}

func TestDatabaseURLLegacyFallback(t *testing.T) {
	t.Setenv("POSTGRES_USER", "")
	t.Setenv("POSTGRES_DB", "")
	t.Setenv("DATABASE_URL", "postgres://legacy:legacy@db:5432/terra?sslmode=disable")

	got, err := databaseURL()
	if err != nil || got != "postgres://legacy:legacy@db:5432/terra?sslmode=disable" {
		t.Fatalf("fallback heredado inesperado: %q err=%v", got, err)
	}
}

func TestDatabaseURLRequiresPassword(t *testing.T) {
	t.Setenv("POSTGRES_USER", "usuario")
	t.Setenv("POSTGRES_PASSWORD", "")
	t.Setenv("POSTGRES_DB", "terra")
	t.Setenv("DATABASE_URL", "")

	if _, err := databaseURL(); err == nil {
		t.Fatal("se aceptó POSTGRES_PASSWORD vacía")
	}
}
