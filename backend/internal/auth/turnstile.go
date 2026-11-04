package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"terra/internal/platform/apperr"
	"terra/internal/platform/httpx"
)

// Turnstile verifies admin login tokens against Cloudflare Siteverify. The widget
// rendering is irrelevant; only this server-side call authorizes a login.
type Turnstile struct {
	SecretKey string
	Hostname  string
	Action    string
	VerifyURL string
	Client    *http.Client
	Logger    *slog.Logger
}

type turnstileResponse struct {
	Success    bool     `json:"success"`
	Hostname   string   `json:"hostname"`
	Action     string   `json:"action"`
	ErrorCodes []string `json:"error-codes"`
}

func (t *Turnstile) Verify(ctx context.Context, token, remoteIP string) (err error) {
	started := time.Now()
	var result turnstileResponse
	defer func() { t.logVerify(ctx, started, result, err) }()
	if t.SecretKey == "" {
		return apperr.New(http.StatusServiceUnavailable, "turnstile_not_configured",
			"La verificación Turnstile no está configurada.")
	}
	if strings.TrimSpace(token) == "" || len(token) > 2048 {
		return apperr.Forbidden("La verificación de seguridad no es válida.")
	}
	form := url.Values{}
	form.Set("secret", t.SecretKey)
	form.Set("response", token)
	if remoteIP != "" {
		form.Set("remoteip", remoteIP)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.VerifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return apperr.Internal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := t.Client
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return apperr.New(http.StatusBadGateway, "turnstile_unavailable",
			"No fue posible validar la verificación de seguridad. Intente nuevamente.")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return apperr.New(http.StatusBadGateway, "turnstile_unavailable",
			"No fue posible validar la verificación de seguridad. Intente nuevamente.")
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return apperr.New(http.StatusBadGateway, "turnstile_unavailable", "Respuesta inválida de Turnstile.")
	}
	if !result.Success {
		return apperr.New(http.StatusForbidden, "turnstile_failed",
			fmt.Sprintf("La verificación de seguridad falló (%s). Vuelva a intentarlo.",
				strings.Join(result.ErrorCodes, ",")))
	}
	if t.Action != "" && result.Action != t.Action {
		return apperr.Forbidden("La verificación de seguridad no corresponde a esta operación.")
	}
	if t.Hostname != "" && result.Hostname != t.Hostname {
		return apperr.Forbidden("La verificación de seguridad no corresponde a este dominio.")
	}
	return nil
}

// logVerify records the Siteverify outcome. The token and the secret key are
// deliberately absent: only metadata useful for diagnosis is emitted.
func (t *Turnstile) logVerify(ctx context.Context, started time.Time, result turnstileResponse, err error) {
	if t.Logger == nil {
		return
	}
	outcome, code := "success", ""
	if err != nil {
		outcome = "rejected"
		var appErr *apperr.Error
		if errors.As(err, &appErr) {
			code = appErr.Code
			if appErr.Status >= http.StatusInternalServerError {
				outcome = "unavailable"
			}
		}
	}
	t.Logger.Info("turnstile_verify",
		"request_id", httpx.RequestIDFrom(ctx),
		"outcome", outcome,
		"code", code,
		"duration_ms", time.Since(started).Milliseconds(),
		"action", result.Action,
		"hostname", result.Hostname,
		"error_codes", result.ErrorCodes,
	)
}
