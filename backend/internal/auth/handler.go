package auth

import (
	"net/http"
	"strings"

	"terra/internal/platform/apperr"
	"terra/internal/platform/crypto"
	"terra/internal/platform/httpx"
	"terra/internal/platform/principal"
)

type Handler struct {
	svc      *Service
	ipSecret string
}

func NewHandler(svc *Service, ipSecret string) *Handler {
	return &Handler{svc: svc, ipSecret: ipSecret}
}

func (h *Handler) ip(r *http.Request) string {
	return crypto.HashIP(httpx.ClientIP(r), h.ipSecret)
}

func (h *Handler) sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true // non-browser client; CSRF/Turnstile still apply
	}
	return strings.TrimRight(origin, "/") == strings.TrimRight(h.svc.cfg.PublicURL, "/")
}

func (h *Handler) GoogleStart(w http.ResponseWriter, r *http.Request) {
	url, state, err := h.svc.StartLogin(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	h.svc.SetOAuthStateCookie(w, state)
	http.Redirect(w, r, url, http.StatusFound)
}

func (h *Handler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	fail := func(code string) {
		http.Redirect(w, r, h.svc.cfg.PublicURL+"/?error="+code, http.StatusFound)
	}
	cookie, err := r.Cookie("terra_oauth_state")
	if err != nil || cookie.Value == "" {
		fail("oauth_state")
		return
	}
	state := r.URL.Query().Get("state")
	if state == "" || state != cookie.Value {
		fail("oauth_state")
		return
	}
	if r.URL.Query().Get("error") != "" {
		fail("oauth_denied")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		fail("oauth_code")
		return
	}
	h.svc.clearCookies(w)
	result, err := h.svc.CompleteLogin(r.Context(), state, code, r.UserAgent(), h.ip(r))
	if err != nil {
		fail("login_failed")
		return
	}
	h.svc.SetSessionCookies(w, result.Login)
	http.Redirect(w, r, h.svc.cfg.PublicURL+result.RedirectTo, http.StatusFound)
}

func (h *Handler) AdminLogin(w http.ResponseWriter, r *http.Request) {
	if !h.sameOrigin(r) {
		httpx.WriteError(w, r, apperr.Forbidden("Origen de la petición no permitido."))
		return
	}
	var body struct {
		Username       string `json:"username"`
		Password       string `json:"password"`
		TurnstileToken string `json:"turnstile_token"`
	}
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	result, err := h.svc.AdminLogin(r.Context(), httpx.ClientIP(r), body.Username, body.Password,
		body.TurnstileToken, r.UserAgent())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	h.svc.SetSessionCookies(w, result)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"user":                 result.User,
		"must_rotate_password": result.MustRotate,
		"pending_profile":      result.Pending,
		"permissions":          PermissionsFor(result.User.Roles),
	})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(h.svc.cfg.SessionCookie); err == nil {
		userID := ""
		if u, ok := principal.Current(r.Context()); ok {
			userID = u.ID.String()
		}
		h.svc.Logout(r.Context(), cookie.Value, userID, h.ip(r))
	}
	h.svc.ClearSessionCookies(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "logged_out"})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := principal.Current(r.Context())
	if !ok {
		httpx.WriteError(w, r, apperr.Unauthorized("Debe iniciar sesión."))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.svc.Me(r.Context(), user))
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user, ok := principal.Current(r.Context())
	if !ok {
		httpx.WriteError(w, r, apperr.Unauthorized("Debe iniciar sesión."))
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	cookie, _ := r.Cookie(h.svc.cfg.SessionCookie)
	token := ""
	if cookie != nil {
		token = cookie.Value
	}
	if err := h.svc.ChangePassword(r.Context(), user.ID, token, body.CurrentPassword, body.NewPassword, h.ip(r)); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "password_changed"})
}

// Middleware accessors keep routing code dependent on the transport component only.
func (h *Handler) RequireAuth(next http.Handler) http.Handler   { return h.svc.RequireAuth(next) }
func (h *Handler) RequireActive(next http.Handler) http.Handler { return h.svc.RequireActive(next) }
func (h *Handler) RequireAdmin(next http.Handler) http.Handler  { return h.svc.RequireAdmin(next) }
