package downloads

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/platform/crypto"
	"terra/internal/platform/httpx"
	"terra/internal/platform/principal"
	"terra/internal/platform/rbac"
)

type Handler struct {
	svc      *Service
	repo     *Repository
	cfg      config.Config
	ipSecret string
}

func NewHandler(svc *Service, repo *Repository, cfg config.Config, ipSecret string) *Handler {
	return &Handler{svc: svc, repo: repo, cfg: cfg, ipSecret: ipSecret}
}

func (h *Handler) ip(r *http.Request) string {
	return crypto.HashIP(httpx.ClientIP(r), h.ipSecret)
}

type createBody struct {
	ScopeType     string   `json:"scope_type"`
	RootFolderIDs []string `json:"root_folder_ids"`
	RootFileIDs   []string `json:"root_file_ids"`
}

func (h *Handler) AdminCreate(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	ownerID, err := uuid.Parse(r.PathValue("userId"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de trabajador inválido."))
		return
	}
	var body createBody
	if err := httpx.Decode(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(key) > 128 {
		httpx.WriteError(w, r, apperr.BadRequest("Idempotency-Key demasiado larga."))
		return
	}
	job, created, err := h.svc.Create(r.Context(), actor.ID, ownerID, CreateInput{
		ScopeType: body.ScopeType, RootFolderIDs: body.RootFolderIDs, RootFileIDs: body.RootFileIDs,
	}, key, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.Header().Set("Location", "/api/v1/download-jobs/"+job.ID.String())
	if !created {
		w.Header().Set("Idempotent-Replayed", "true")
	}
	httpx.WriteJSON(w, http.StatusAccepted, job)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	page, size, _ := httpx.Pagination(r)
	filter, err := parseJobFilter(r, page, size)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if !actor.Can(rbac.PermJobsRead) {
		filter.RestrictToUser = &actor.ID
	}
	jobs, total, err := h.svc.List(r.Context(), filter)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.ListResponse{
		Data: jobs, Pagination: httpx.Page{Page: page, PageSize: size, Total: total},
	})
}

func parseJobFilter(r *http.Request, page, size int) (ListFilter, error) {
	q := r.URL.Query()
	f := ListFilter{Status: q.Get("status"), Scope: q.Get("scope_type"), Query: strings.TrimSpace(q.Get("q")),
		Page: page, Size: size}
	for name, target := range map[string]**uuid.UUID{
		"area_id": &f.AreaID, "position_id": &f.PositionID, "user_id": &f.OwnerID,
	} {
		if raw := q.Get(name); raw != "" {
			id, err := uuid.Parse(raw)
			if err != nil {
				return f, apperr.BadRequest("Filtro " + name + " inválido.")
			}
			*target = &id
		}
	}
	if raw := q.Get("requested_by"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			return f, apperr.BadRequest("Filtro requested_by inválido.")
		}
		f.RequesterID = &id
	}
	from, toExclusive, err := httpx.ParseDateRange(q)
	if err != nil {
		return f, err
	}
	f.From, f.To = from, toExclusive
	return f, nil
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	jobID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de trabajo inválido."))
		return
	}
	job, err := h.svc.Get(r.Context(), actor.ID, actor.Can(rbac.PermJobsRead), jobID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	job.Progress, job.ProgressRevision = h.svc.Progress(r.Context(), job)
	httpx.WriteJSON(w, http.StatusOK, job)
}

func (h *Handler) Items(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	jobID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de trabajo inválido."))
		return
	}
	page, size, _ := httpx.Pagination(r)
	items, total, err := h.svc.Items(r.Context(), actor.ID, actor.Can(rbac.PermJobsRead), jobID,
		ItemFilter{Status: r.URL.Query().Get("status"), Page: page, Size: size})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.ListResponse{
		Data: items, Pagination: httpx.Page{Page: page, PageSize: size, Total: total},
	})
}

func (h *Handler) Cancel(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	jobID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de trabajo inválido."))
		return
	}
	job, err := h.svc.Cancel(r.Context(), actor.ID, actor.Can(rbac.PermJobsCancel), jobID, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, job)
}

func (h *Handler) Retry(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	jobID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de trabajo inválido."))
		return
	}
	job, err := h.svc.RetryFailed(r.Context(), actor.ID, jobID, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, job)
}

func (h *Handler) FileContent(w http.ResponseWriter, r *http.Request) {
	actor, _ := principal.Current(r.Context())
	fileID, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, r, apperr.BadRequest("Identificador de documento inválido."))
		return
	}
	file, info, meta, err := h.svc.OpenFile(r.Context(), actor.ID, actor.Can(rbac.PermFilesRead), fileID, h.ip(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", contentDisposition(meta.Name))
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, meta.Name, info.ModTime(), file)
}

func contentDisposition(name string) string {
	name = strings.ReplaceAll(name, "\r", "")
	name = strings.ReplaceAll(name, "\n", "")
	ascii := strings.Map(func(r rune) rune {
		if r < 0x20 || r > 0x7e || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, name)
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii, url.PathEscape(name))
}
