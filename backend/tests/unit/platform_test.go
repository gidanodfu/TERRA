package unit_test

import (
	"testing"

	"terra/internal/auth"
	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/platform/apperr"
	"terra/internal/platform/ratelimit"
	"terra/internal/platform/validate"
)

func TestValidationHelpers(t *testing.T) {
	if got := validate.Slug("Área de Recursos Humanos"); got != "area-de-recursos-humanos" {
		t.Fatalf("slug inesperado: %q", got)
	}
	if !validate.IsSlug("area-de-prueba") || validate.IsSlug("Area inválida") {
		t.Fatal("validación de slug incorrecta")
	}
	if got := validate.NormalizeName("  Cargo   Único "); got != "cargo único" {
		t.Fatalf("normalización inesperada: %q", got)
	}
}

func TestRateLimiter(t *testing.T) {
	l := ratelimit.New(2, 60_000_000_000)
	if !l.Allow("k") || !l.Allow("k") {
		t.Fatal("los dos primeros intentos deben pasar")
	}
	if l.Allow("k") {
		t.Fatal("el tercer intento debe bloquearse")
	}
}

func TestPermissionsAndErrors(t *testing.T) {
	admin := auth.PermissionsFor([]string{"admin"})
	if len(admin) == 0 || admin[0] == "" {
		t.Fatal("admin sin permisos")
	}
	user := auth.PermissionsFor([]string{"user"})
	for _, p := range user {
		if p == "admin.users.write" {
			t.Fatal("trabajador no debe tener permisos administrativos")
		}
	}
	err := apperr.Invalid("datos", map[string]string{"campo": "requerido"})
	if apperr.As(err).Status != 422 {
		t.Fatal("traducción de error incorrecta")
	}
}

func TestDomainConstantsAndExports(t *testing.T) {
	if downloads.JobCompleted == downloads.JobFailed || !downloads.IsTerminal(downloads.JobCancelled) {
		t.Fatal("estados de descarga incorrectos")
	}
	if !downloads.IsTerminal(downloads.JobPartiallyCompleted) || downloads.IsTerminal(downloads.JobDownloading) {
		t.Fatal("terminalidad incorrecta")
	}
	mime, ok := drive.ExportMime(drive.MimeDocument)
	if !ok || mime == "" {
		t.Fatal("exportación de documento no configurada")
	}
	if _, ok := drive.ExportMime(drive.MimeVids); ok {
		t.Fatal("Vids no debe exportarse")
	}
}
