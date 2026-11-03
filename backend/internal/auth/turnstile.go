package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"terra/internal/platform/apperr"
)

// Turnstile verifies admin login tokens against Cloudflare Siteverify. The widget
// rendering is irrelevant; only this server-side call authorizes a login.
type Turnstile struct {
	SecretKey string
	Hostname  string
	Action    string
	VerifyURL string
	Client    *http.Client
}

type turnstileResponse struct {
	Success    bool     `json:"success"`
	Hostname   string   `json:"hostname"`
	Action     string   `json:"action"`
	ErrorCodes []string `json:"error-codes"`
}

func (t *Turnstile) Verify(ctx context.Context, token, remoteIP string) error {
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
	var body turnstileResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return apperr.New(http.StatusBadGateway, "turnstile_unavailable", "Respuesta inválida de Turnstile.")
	}
	if !body.Success {
		return apperr.New(http.StatusForbidden, "turnstile_failed",
			fmt.Sprintf("La verificación de seguridad falló (%s). Vuelva a intentarlo.",
				strings.Join(body.ErrorCodes, ",")))
	}
	if t.Action != "" && body.Action != t.Action {
		return apperr.Forbidden("La verificación de seguridad no corresponde a esta operación.")
	}
	if t.Hostname != "" && body.Hostname != t.Hostname {
		return apperr.Forbidden("La verificación de seguridad no corresponde a este dominio.")
	}
	return nil
}
