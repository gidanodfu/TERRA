package drive

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"terra/internal/platform/apperr"
	"terra/internal/platform/crypto"
	"terra/internal/platform/googleoauth"
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

func (h *Handler) GetMine(w http.ResponseWriter, r *http.Request) {
	user, _ := principal.Current(r.Context())
	conn, err := h.svc.Connection(r.Context(), user.ID)
	if err != nil {
		var e *apperr.Error
		if !errors.As(err, &e) || e.Status != http.StatusNotFound {
			httpx.WriteError(w, r, err)
			return
		}
		conn = nil
	}
	policy, policyErr := h.svc.LatestPolicy(r.Context())
	if policyErr != nil {
		policy = nil
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"connection": conn, "policy": policy})
}

func (h *Handler) ConnectMine(w http.ResponseWriter, r *http.Request) {
	user, _ := principal.Current(r.Context())
	var body struct {
		RedirectAfter string `json:"redirect_after"`
	}
	if r.ContentLength > 0 {
		if err := httpx.Decode(w, r, &body); err != nil {
			httpx.WriteError(w, r, err)
			return
		}
	}
	url, state, err := h.svc.StartConnect(r.Context(), user.ID, googleoauth.SanitizeRedirect(body.RedirectAfter))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "terra_oauth_state", Value: state, Path: "/", HttpOnly: true,
		Secure: h.svc.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: 600})
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"authorization_url": url})
}

func (h *Handler) DisconnectMine(w http.ResponseWriter, r *http.Request) {
	user, _ := principal.Current(r.Context())
	if err := h.svc.Disconnect(r.Context(), user.ID, h.ip(r)); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "disconnected"})
}

func (h *Handler) AcceptPolicy(w http.ResponseWriter, r *http.Request) {
	user, _ := principal.Current(r.Context())
	var body struct {
		Version string `json:"version"`
	}
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	conn, err := h.svc.AcceptPolicy(r.Context(), user.ID, strings.TrimSpace(body.Version), h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, conn)
}

func (h *Handler) PolicyPublic(w http.ResponseWriter, r *http.Request) {
	policy, err := h.svc.LatestPolicy(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, policy)
}

func (h *Handler) PublishPolicy(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.UserID(r.Context())
	var body struct {
		Version string `json:"version"`
		Content string `json:"content"`
	}
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	policy, err := h.svc.CreatePolicy(r.Context(), actor, body.Version, body.Content, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, policy)
}

func (h *Handler) AdminConnection(w http.ResponseWriter, r *http.Request) {
	ownerID, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de trabajador inválido."))
		return
	}
	conn, err := h.svc.AdminConnection(r.Context(), ownerID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	policy, _ := h.svc.LatestPolicy(r.Context())
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"connection": conn, "policy": policy})
}

func (h *Handler) AdminFolders(w http.ResponseWriter, r *http.Request) {
	ownerID, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de trabajador inválido."))
		return
	}
	result, err := h.svc.Browse(r.Context(), ownerID, r.URL.Query().Get("parentId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) AdminConnections(w http.ResponseWriter, r *http.Request) {
	page, size, _ := httpx.Pagination(r)
	rows, total, err := h.svc.AdminConnections(r.Context(), r.URL.Query().Get("status"), page, size)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.ListResponse{
		Data: rows, Pagination: httpx.Page{Page: page, PageSize: size, Total: total},
	})
}

func (h *Handler) Callback(w http.ResponseWriter, r *http.Request) {
	fail := func(code string) {
		http.Redirect(w, r, h.svc.cfg.PublicURL+"/app/drive?error="+code, http.StatusFound)
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
	http.SetCookie(w, &http.Cookie{Name: "terra_oauth_state", Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: h.svc.cfg.IsProduction(), SameSite: http.SameSiteLaxMode})
	if r.URL.Query().Get("error") != "" {
		fail("oauth_denied")
		return
	}
	code := r.URL.Query().Get("code")
	if code == "" {
		fail("oauth_code")
		return
	}
	if _, err := h.svc.CompleteConnect(r.Context(), state, code, h.ip(r)); err != nil {
		var e *apperr.Error
		if errors.As(err, &e) && e.Code == "drive_account_mismatch" {
			fail("account_mismatch")
			return
		}
		fail("drive_connect_failed")
		return
	}
	http.Redirect(w, r, h.svc.cfg.PublicURL+"/app/drive?connected=1", http.StatusFound)
}
