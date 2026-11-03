package admin

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/platform/apperr"
	"terra/internal/platform/crypto"
	"terra/internal/platform/httpx"
	"terra/internal/platform/principal"
	"terra/internal/users"
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

func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	d, err := h.svc.Dashboard(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, d)
}

func (h *Handler) Users(w http.ResponseWriter, r *http.Request) {
	page, size, _ := httpx.Pagination(r)
	q := r.URL.Query()
	f := users.ListFilter{Query: strings.TrimSpace(q.Get("q")), Status: q.Get("status"), Page: page, Size: size}
	for name, target := range map[string]**uuid.UUID{"area_id": &f.AreaID, "position_id": &f.PositionID} {
		if raw := q.Get(name); raw != "" {
			id, err := uuid.Parse(raw)
			if err != nil {
				httpx.WriteError(w, r, apperr.BadRequest("Filtro "+name+" inválido."))
				return
			}
			*target = &id
		}
	}
	list, total, err := h.svc.Users(r.Context(), f)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.ListResponse{
		Data: list, Pagination: httpx.Page{Page: page, PageSize: size, Total: total},
	})
}

func (h *Handler) User(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de usuario inválido."))
		return
	}
	detail, err := h.svc.User(r.Context(), id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, detail)
}

func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de usuario inválido."))
		return
	}
	var body UpdateUserInput
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	updated, err := h.svc.UpdateUser(r.Context(), actor.ID, id, body, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, updated)
}

func (h *Handler) AuditEvents(w http.ResponseWriter, r *http.Request) {
	page, size, _ := httpx.Pagination(r)
	q := r.URL.Query()
	f := audit.ListFilter{Action: q.Get("action"), Page: page, Size: size}
	if raw := q.Get("actor_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			httpx.WriteError(w, r, apperr.BadRequest("Filtro actor_id inválido."))
			return
		}
		f.ActorID = &id
	}
	if raw := q.Get("from"); raw != "" {
		t, err := time.Parse("2006-01-02", raw)
		if err != nil {
			httpx.WriteError(w, r, apperr.BadRequest("Fecha desde inválida."))
			return
		}
		f.From = &t
	}
	if raw := q.Get("to"); raw != "" {
		t, err := time.Parse("2006-01-02", raw)
		if err != nil {
			httpx.WriteError(w, r, apperr.BadRequest("Fecha hasta inválida."))
			return
		}
		end := t.Add(24*time.Hour - time.Second)
		f.To = &end
	}
	events, total, err := h.svc.Audit(r.Context(), f)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.ListResponse{
		Data: events, Pagination: httpx.Page{Page: page, PageSize: size, Total: total},
	})
}
