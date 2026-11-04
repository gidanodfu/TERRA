//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/audit"
	"terra/internal/auth"
	"terra/internal/platform/config"
	"terra/internal/platform/oauthstate"
	"terra/internal/platform/password"
	"terra/internal/users"
	"terra/tests/helpers"
)

type turnstileFixture struct {
	turnstile *auth.Turnstile
	calls     atomic.Int32
}

func newTurnstileFixture(t *testing.T, status int, body map[string]any) *turnstileFixture {
	t.Helper()
	fixture := &turnstileFixture{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fixture.calls.Add(1)
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse siteverify form: %v", err)
			return
		}
		if r.Form.Get("secret") == "" || r.Form.Get("response") == "" {
			t.Error("siteverify sin secret o response")
		}
		if status != 0 {
			w.WriteHeader(status)
			_, _ = w.Write([]byte("unavailable"))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(server.Close)
	fixture.turnstile = &auth.Turnstile{
		SecretKey: "secret",
		Action:    "admin_login",
		Hostname:  "localhost",
		VerifyURL: server.URL,
		Client:    server.Client(),
	}
	return fixture
}

func newReplayTurnstileFixture(t *testing.T) *turnstileFixture {
	t.Helper()
	fixture := &turnstileFixture{}
	var mu sync.Mutex
	used := map[string]bool{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fixture.calls.Add(1)
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse siteverify form: %v", err)
			return
		}
		token := r.Form.Get("response")
		mu.Lock()
		replay := used[token]
		used[token] = true
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if replay {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": false, "error-codes": []string{"timeout-or-duplicate"},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true, "action": "admin_login", "hostname": "localhost",
		})
	}))
	t.Cleanup(server.Close)
	fixture.turnstile = &auth.Turnstile{
		SecretKey: "secret", Action: "admin_login", Hostname: "localhost",
		VerifyURL: server.URL, Client: server.Client(),
	}
	return fixture
}

type adminLoginFixture struct {
	handler *auth.Handler
	pool    *pgxpool.Pool
	userID  uuid.UUID
}

func newAdminLoginFixture(t *testing.T, turnstile *auth.Turnstile) *adminLoginFixture {
	t.Helper()
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Admin", "Cargo Admin")
	userID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	hash, err := password.Hash("correct-password-123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO local_credentials
		(user_id, username, password_hash, must_rotate_password) VALUES ($1,$2,$3,false)`,
		userID, "admin-test", hash); err != nil {
		t.Fatalf("seed local credential: %v", err)
	}
	cfg := config.Config{
		Env:           "development",
		PublicURL:     "http://localhost:8080",
		SessionCookie: "terra_session",
		SessionTTL:    time.Hour,
		SessionSecret: strings.Repeat("x", 32),
	}
	svc := auth.NewService(cfg, auth.NewRepository(pool), users.NewRepository(pool), nil,
		oauthstate.NewRepository(pool), turnstile, audit.NewRepository(pool))
	return &adminLoginFixture{
		handler: auth.NewHandler(svc, "ip-secret"),
		pool:    pool,
		userID:  userID,
	}
}

func (f *adminLoginFixture) login(t *testing.T, plainPassword, token string) *httptest.ResponseRecorder {
	t.Helper()
	body := fmt.Sprintf(`{"username":"admin-test","password":%q,"turnstile_token":%q}`, plainPassword, token)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/admin/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.10:1234"
	rec := httptest.NewRecorder()
	f.handler.AdminLogin(rec, req)
	return rec
}

func (f *adminLoginFixture) sessions(t *testing.T) int {
	t.Helper()
	var count int
	if err := f.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM sessions WHERE user_id=$1`, f.userID).Scan(&count); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	return count
}

func TestAdminLoginWrongPasswordDoesNotCreateSession(t *testing.T) {
	turnstile := newTurnstileFixture(t, 0, map[string]any{
		"success": true, "action": "admin_login", "hostname": "localhost",
	})
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "wrong-password-123", "token-1")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("contraseña incorrecta: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("se creó una sesión tras fallo: %d", count)
	}

	rec = fixture.login(t, "correct-password-123", "token-2")
	if rec.Code != http.StatusOK {
		t.Fatalf("contraseña correcta: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 1 {
		t.Fatalf("sesiones tras login correcto: %d", count)
	}
	if len(rec.Result().Cookies()) == 0 {
		t.Fatal("login correcto sin cookies de sesión")
	}
	if turnstile.calls.Load() != 2 {
		t.Fatalf("siteverify calls=%d", turnstile.calls.Load())
	}
}

func TestAdminLoginRejectsTurnstileBeforePassword(t *testing.T) {
	turnstile := newTurnstileFixture(t, 0, map[string]any{
		"success": false, "error-codes": []string{"invalid-input-response"},
	})
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "correct-password-123", "token-invalid")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("turnstile rechazado: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada con turnstile inválido: %d", count)
	}
}

func TestAdminLoginTurnstileUnavailable(t *testing.T) {
	turnstile := newTurnstileFixture(t, http.StatusServiceUnavailable, nil)
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "correct-password-123", "token-1")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("turnstile no disponible: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada con turnstile no disponible: %d", count)
	}
}

func TestAdminLoginRejectsTurnstileActionMismatch(t *testing.T) {
	turnstile := newTurnstileFixture(t, 0, map[string]any{
		"success": true, "action": "other_action", "hostname": "localhost",
	})
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "correct-password-123", "token-1")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("acción distinta: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada con acción distinta: %d", count)
	}
}

func TestAdminLoginRejectsTurnstileHostnameMismatch(t *testing.T) {
	turnstile := newTurnstileFixture(t, 0, map[string]any{
		"success": true, "action": "admin_login", "hostname": "evil.example",
	})
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "correct-password-123", "token-1")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("hostname distinto: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada con hostname distinto: %d", count)
	}
}

func TestAdminLoginRateLimitKeepsBlocking(t *testing.T) {
	turnstile := newTurnstileFixture(t, 0, map[string]any{
		"success": true, "action": "admin_login", "hostname": "localhost",
	})
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	for attempt := 1; attempt <= 6; attempt++ {
		rec := fixture.login(t, "wrong-password-123", fmt.Sprintf("token-%d", attempt))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("intento %d: status=%d body=%s", attempt, rec.Code, rec.Body.String())
		}
	}
	if turnstile.calls.Load() != 6 {
		t.Fatalf("siteverify calls antes del límite=%d", turnstile.calls.Load())
	}

	rec := fixture.login(t, "correct-password-123", "token-7")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("séptimo intento: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada tras rate limit: %d", count)
	}
	if turnstile.calls.Load() != 6 {
		t.Fatalf("el rate limit no ocurrió antes de siteverify: calls=%d", turnstile.calls.Load())
	}
}

func TestAdminLoginRejectsMissingTurnstileToken(t *testing.T) {
	turnstile := newTurnstileFixture(t, 0, map[string]any{
		"success": true, "action": "admin_login", "hostname": "localhost",
	})
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "correct-password-123", "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("token ausente: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if turnstile.calls.Load() != 0 {
		t.Fatalf("token ausente llegó a Siteverify: calls=%d", turnstile.calls.Load())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada sin token Turnstile: %d", count)
	}
}

func TestAdminLoginRejectsExpiredTurnstileToken(t *testing.T) {
	turnstile := newTurnstileFixture(t, 0, map[string]any{
		"success": false, "error-codes": []string{"timeout-or-duplicate"},
	})
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "correct-password-123", "token-expired")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("token expirado: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada con token expirado: %d", count)
	}
}

func TestAdminLoginRejectsReusedTurnstileToken(t *testing.T) {
	turnstile := newReplayTurnstileFixture(t)
	fixture := newAdminLoginFixture(t, turnstile.turnstile)

	rec := fixture.login(t, "correct-password-123", "token-reused")
	if rec.Code != http.StatusOK {
		t.Fatalf("primer uso: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 1 {
		t.Fatalf("sesiones tras primer uso: %d", count)
	}

	rec = fixture.login(t, "correct-password-123", "token-reused")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("token reutilizado: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 1 {
		t.Fatalf("el token reutilizado creó otra sesión: %d", count)
	}
	if turnstile.calls.Load() != 2 {
		t.Fatalf("Siteverify no recibió ambos intentos: calls=%d", turnstile.calls.Load())
	}
}

func TestAdminLoginTurnstileConnectionError(t *testing.T) {
	turnstile := &auth.Turnstile{
		SecretKey: "secret", Action: "admin_login", Hostname: "localhost",
		VerifyURL: "http://127.0.0.1:1",
		Client:    &http.Client{Timeout: 2 * time.Second},
	}
	fixture := newAdminLoginFixture(t, turnstile)

	rec := fixture.login(t, "correct-password-123", "token-1")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("error de conexión: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if count := fixture.sessions(t); count != 0 {
		t.Fatalf("sesión creada sin conexión a Cloudflare: %d", count)
	}
}
