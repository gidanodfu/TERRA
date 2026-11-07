package organization

import (
	"net/http"

	"github.com/google/uuid"

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

func (h *Handler) PublicAreas(w http.ResponseWriter, r *http.Request) {
	areas, err := h.svc.Areas(r.Context(), false)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"data": areas})
}

func (h *Handler) PublicPositions(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("areaId"))
	if err != nil {
		httpx.WriteError(w, r, httpxBadID())
		return
	}
	positions, err := h.svc.Positions(r.Context(), id, false)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"data": positions})
}

func (h *Handler) AdminAreas(w http.ResponseWriter, r *http.Request) {
	areas, err := h.svc.Areas(r.Context(), true)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"data": areas})
}

type nameStatusBody struct {
	Name             *string   `json:"name"`
	Status           *string   `json:"status"`
	Responsibilities *[]string `json:"responsibilities"`
}

func (h *Handler) CreateArea(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name             string   `json:"name"`
		Responsibilities []string `json:"responsibilities"`
	}
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	actor, _ := principal.UserID(r.Context())
	area, err := h.svc.CreateArea(r.Context(), actor, h.ip(r), body.Name, body.Responsibilities)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, area)
}

func (h *Handler) UpdateArea(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, httpxBadID())
		return
	}
	var body nameStatusBody
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	actor, _ := principal.UserID(r.Context())
	area, err := h.svc.UpdateArea(r.Context(), actor, h.ip(r), id, body.Name, body.Status, body.Responsibilities)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, area)
}

func (h *Handler) AdminPositions(w http.ResponseWriter, r *http.Request) {
	areaID, err := uuid.Parse(r.PathValue("areaId"))
	if err != nil {
		httpx.WriteError(w, r, httpxBadID())
		return
	}
	positions, err := h.svc.Positions(r.Context(), areaID, true)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"data": positions})
}

func (h *Handler) CreatePosition(w http.ResponseWriter, r *http.Request) {
	areaID, err := uuid.Parse(r.PathValue("areaId"))
	if err != nil {
		httpx.WriteError(w, r, httpxBadID())
		return
	}
	var body struct {
		Name             string   `json:"name"`
		Responsibilities []string `json:"responsibilities"`
	}
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	actor, _ := principal.UserID(r.Context())
	position, err := h.svc.CreatePosition(r.Context(), actor, h.ip(r), areaID, body.Name, body.Responsibilities)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, position)
}

func (h *Handler) UpdatePosition(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, httpxBadID())
		return
	}
	var body nameStatusBody
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	actor, _ := principal.UserID(r.Context())
	position, err := h.svc.UpdatePosition(r.Context(), actor, h.ip(r), id, body.Name, body.Status, body.Responsibilities)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, position)
}

func httpxBadID() error {
	return apperr.BadRequest("Identificador inválido.")
}
