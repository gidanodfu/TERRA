//go:build integration

package integration_test

import (
	"context"
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"terra/internal/audit"
	"terra/internal/auth"
	"terra/internal/platform/config"
	"terra/internal/platform/oauthstate"
	"terra/internal/users"
	"terra/tests/helpers"
)

func TestAuthMiddlewareCSRFAndSuspension(t *testing.T) {
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Auth", "Cargo Auth")
	userID := helpers.SeedUser(t, pool, areaID, positionID, "active")

	authRepo := auth.NewRepository(pool)
	usersRepo := users.NewRepository(pool)
	states := oauthstate.NewRepository(pool)
	auditRepo := audit.NewRepository(pool)
	rawToken := "test-session-token"
	csrf := "test-csrf-token"
	hash := sha256.Sum256([]byte(rawToken))
	if _, err := authRepo.CreateSession(context.Background(), userID, hash[:], csrf,
		time.Now().Add(time.Hour), "integration-test", "ip-hash"); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		Env: "development", PublicURL: "http://localhost:8080",
		SessionCookie: "terra_session", SessionTTL: time.Hour, SessionSecret: strings.Repeat("x", 32),
	}
	svc := auth.NewService(cfg, authRepo, usersRepo, nil, states, &auth.Turnstile{}, auditRepo)
	handler := svc.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	server := httptest.NewServer(handler)
	defer server.Close()

	req, _ := http.NewRequest(http.MethodGet, server.URL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("sin cookie: status=%v err=%v", resp.StatusCode, err)
	}
	_ = resp.Body.Close()

	req, _ = http.NewRequest(http.MethodGet, server.URL, nil)
	req.AddCookie(&http.Cookie{Name: "terra_session", Value: rawToken})
	resp, err = http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("con cookie: status=%v err=%v", resp.StatusCode, err)
	}
	_ = resp.Body.Close()

	req, _ = http.NewRequest(http.MethodPost, server.URL, nil)
	req.AddCookie(&http.Cookie{Name: "terra_session", Value: rawToken})
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("POST sin CSRF: %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	req, _ = http.NewRequest(http.MethodPost, server.URL, nil)
	req.AddCookie(&http.Cookie{Name: "terra_session", Value: rawToken})
	req.AddCookie(&http.Cookie{Name: "terra_csrf", Value: csrf})
	req.Header.Set("X-CSRF-Token", csrf)
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST con CSRF: %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	if _, err := pool.Exec(context.Background(), `UPDATE users SET status='suspended' WHERE id=$1`, userID); err != nil {
		t.Fatal(err)
	}
	var sessions int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM sessions WHERE user_id=$1`, userID).Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	if sessions != 0 {
		t.Fatalf("el trigger debe invalidar sesiones; quedan %d", sessions)
	}
}
