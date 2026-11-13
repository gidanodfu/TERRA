package admin

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/platform/apperr"
	"terra/internal/platform/crypto"
	"terra/internal/platform/httpx"
	"terra/internal/platform/principal"
	"terra/internal/platform/rbac"
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
	actor, _ := principal.Current(r.Context())
	scope, _ := auditScope(actor)
	d, err := h.svc.Dashboard(r.Context(), scope)
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

func (h *Handler) AdministrativeAccounts(w http.ResponseWriter, r *http.Request) {
	page, size, _ := httpx.Pagination(r)
	q := r.URL.Query()
	f := users.ListFilter{Query: strings.TrimSpace(q.Get("q")), Status: q.Get("status"),
		Role: strings.TrimSpace(q.Get("role")), Page: page, Size: size}
	list, total, err := h.svc.AdministrativeAccounts(r.Context(), f)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.ListResponse{
		Data: list, Pagination: httpx.Page{Page: page, PageSize: size, Total: total},
	})
}

func (h *Handler) CreateAdministrativeAccount(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	var body CreateAdministrativeAccountInput
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	created, err := h.svc.CreateAdministrativeAccount(r.Context(), actor.ID, body, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, created)
}

func (h *Handler) UpdateAdministrativeAccount(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de cuenta inválido."))
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	updated, err := h.svc.UpdateAdministrativeAccount(r.Context(), actor.ID, id, body.Status, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, updated)
}

// auditScope resuelve el alcance desde los permisos reales del principal. La
// auditoría completa tiene prioridad; el cliente no puede elegir el alcance.
func auditScope(actor principal.Identity) (audit.Scope, bool) {
	if actor.Can(rbac.PermAuditRead) {
		return audit.ScopeFull, true
	}
	if actor.Can(rbac.PermAuditOperationalRead) {
		return audit.ScopeOperational, true
	}
	return "", false
}

func (h *Handler) AuditEvents(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	scope, ok := auditScope(actor)
	if !ok {
		httpx.WriteError(w, r, apperr.Forbidden("No tiene permisos para consultar la auditoría."))
		return
	}
	page, size, _ := httpx.Pagination(r)
	q := r.URL.Query()
	f := audit.ListFilter{Action: q.Get("action"), Page: page, Size: size, Scope: scope}
	if raw := q.Get("actor_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			httpx.WriteError(w, r, apperr.BadRequest("Filtro actor_id inválido."))
			return
		}
		f.ActorID = &id
	}
	from, toExclusive, err := httpx.ParseDateRange(q)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	f.From, f.To = from, toExclusive
	events, total, err := h.svc.Audit(r.Context(), f)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.ListResponse{
		Data: events, Pagination: httpx.Page{Page: page, PageSize: size, Total: total},
	})
}
