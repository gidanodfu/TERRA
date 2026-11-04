package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"terra/internal/platform/apperr"
)

func turnstileServer(t *testing.T, body map[string]any) *Turnstile {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("secret") == "" || r.Form.Get("response") == "" {
			t.Error("missing siteverify parameters")
		}
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(srv.Close)
	return &Turnstile{SecretKey: "secret", Action: "admin_login", Hostname: "localhost",
		VerifyURL: srv.URL, Client: srv.Client()}
}

func TestTurnstileSuccess(t *testing.T) {
	ts := turnstileServer(t, map[string]any{"success": true, "action": "admin_login", "hostname": "localhost"})
	if err := ts.Verify(context.Background(), "token", "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
}

func TestTurnstileRejectsFailures(t *testing.T) {
	bodies := []map[string]any{
		{"success": false, "error-codes": []string{"invalid-input-response"}},
		{"success": true, "action": "other", "hostname": "localhost"},
		{"success": true, "action": "admin_login", "hostname": "evil.example"},
	}
	for _, body := range bodies {
		ts := turnstileServer(t, body)
		err := ts.Verify(context.Background(), "token", "127.0.0.1")
		var appErr *apperr.Error
		if !errors.As(err, &appErr) {
			t.Fatalf("error no tipado para %v: %v", body, err)
		}
		if appErr.Status != http.StatusForbidden {
			t.Fatalf("status=%d para %v: %v", appErr.Status, body, err)
		}
	}
}

func TestTurnstileUnavailable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("unavailable"))
	}))
	t.Cleanup(srv.Close)
	ts := &Turnstile{SecretKey: "secret", Action: "admin_login", Hostname: "localhost",
		VerifyURL: srv.URL, Client: srv.Client()}

	err := ts.Verify(context.Background(), "token", "127.0.0.1")
	var appErr *apperr.Error
	if !errors.As(err, &appErr) {
		t.Fatalf("error no tipado: %v", err)
	}
	if appErr.Status != http.StatusBadGateway || appErr.Code != "turnstile_unavailable" {
		t.Fatalf("status=%d code=%s message=%s", appErr.Status, appErr.Code, appErr.Message)
	}
}

func TestTurnstileRequiresConfigurationAndToken(t *testing.T) {
	if err := (&Turnstile{}).Verify(context.Background(), "token", ""); err == nil {
		t.Fatal("unconfigured Turnstile accepted a token")
	}
	ts := turnstileServer(t, map[string]any{"success": true, "action": "admin_login"})
	if err := ts.Verify(context.Background(), "", ""); err == nil {
		t.Fatal("empty token accepted")
	}
}
