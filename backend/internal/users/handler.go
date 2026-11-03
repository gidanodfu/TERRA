package users

import (
	"net/http"

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

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := principal.Current(r.Context())
	if !ok {
		httpx.WriteError(w, r, apperr.Unauthorized("Debe iniciar sesión."))
		return
	}
	var body UpdateProfileInput
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	updated, err := h.svc.UpdateOwnProfile(r.Context(), user.ID, body, crypto.HashIP(httpx.ClientIP(r), h.ipSecret))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, updated)
}
