// Package server wires modules into the public HTTP surface. Business logic stays
// in the use cases; this file only maps routes and authorization boundaries.
package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/admin"
	"terra/internal/auth"
	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/organization"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/platform/httpx"
	"terra/internal/platform/principal"
	"terra/internal/platform/ratelimit"
	"terra/internal/users"
)

type Handlers struct {
	Auth     *auth.Handler
	Users    *users.Handler
	Org      *organization.Handler
	Drive    *drive.Handler
	Download *downloads.Handler
	Admin    *admin.Handler
}

func New(cfg config.Config, log *slog.Logger, pool *pgxpool.Pool, h Handlers) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "api"})
	})
	mux.HandleFunc("GET /api/v1/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := pool.Ping(ctx); err != nil {
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "unavailable"})
			return
		}
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ready"})
	})

	// --- public ---
	mux.HandleFunc("GET /api/v1/public/areas", h.Org.PublicAreas)
	mux.HandleFunc("GET /api/v1/public/areas/{areaId}/positions", h.Org.PublicPositions)
	mux.HandleFunc("GET /api/v1/public/policy", h.Drive.PolicyPublic)
	mux.HandleFunc("GET /api/v1/auth/google/start", h.Auth.GoogleStart)
	mux.HandleFunc("GET /api/v1/auth/google/callback", h.Auth.GoogleCallback)
	mux.HandleFunc("GET /api/v1/auth/google/drive/callback", h.Drive.Callback)
	mux.HandleFunc("POST /api/v1/auth/admin/login", h.Auth.AdminLogin)

	adminOpsLimiter := ratelimit.New(240, time.Minute)
	jobCreateLimiter := ratelimit.New(10, time.Minute)
	jobReadLimiter := ratelimit.New(120, time.Minute)
	fileReadLimiter := ratelimit.New(120, time.Minute)
	driveBrowseLimiter := ratelimit.New(120, time.Minute)

	limited := func(l *ratelimit.Limiter, scope string) httpx.Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				key := scope + ":" + httpx.ClientIP(r)
				if user, ok := principal.Current(r.Context()); ok {
					key = scope + ":" + user.ID.String()
				}
				if !l.Allow(key) {
					httpx.WriteError(w, r, apperr.TooManyRequests("Demasiadas solicitudes. Espere un momento."))
					return
				}
				next.ServeHTTP(w, r)
			})
		}
	}

	requireAuth := func(next http.Handler) http.Handler { return h.Auth.RequireAuth(next) }
	requireActive := func(next http.Handler) http.Handler { return h.Auth.RequireActive(next) }
	requireAdmin := func(next http.Handler) http.Handler {
		return h.Auth.RequireAdmin(limited(adminOpsLimiter, "admin")(next))
	}

	// --- session and own profile ---
	mux.Handle("POST /api/v1/auth/logout", requireAuth(http.HandlerFunc(h.Auth.Logout)))
	mux.Handle("GET /api/v1/auth/me", requireAuth(http.HandlerFunc(h.Auth.Me)))
	mux.Handle("GET /api/v1/me", requireAuth(http.HandlerFunc(h.Auth.Me)))
	mux.Handle("PATCH /api/v1/me/profile", requireAuth(http.HandlerFunc(h.Users.UpdateProfile)))
	mux.Handle("POST /api/v1/auth/password", requireAuth(http.HandlerFunc(h.Auth.ChangePassword)))

	// --- own Drive ---
	mux.Handle("GET /api/v1/me/drive/connection", requireAuth(requireActive(http.HandlerFunc(h.Drive.GetMine))))
	mux.Handle("POST /api/v1/me/drive/connect", requireAuth(requireActive(http.HandlerFunc(h.Drive.ConnectMine))))
	mux.Handle("DELETE /api/v1/me/drive/connection", requireAuth(requireActive(http.HandlerFunc(h.Drive.DisconnectMine))))
	mux.Handle("POST /api/v1/me/drive/consent", requireAuth(requireActive(http.HandlerFunc(h.Drive.AcceptPolicy))))
	mux.Handle("GET /api/v1/me/stored-files", requireAuth(requireActive(http.HandlerFunc(h.Download.MyFiles))))

	// --- jobs accessible to owner/requester (admin sees all, enforced in use case) ---
	mux.Handle("GET /api/v1/download-jobs", requireAuth(requireActive(limited(jobReadLimiter, "jobs")(http.HandlerFunc(h.Download.List)))))
	mux.Handle("GET /api/v1/download-jobs/{id}", requireAuth(requireActive(limited(jobReadLimiter, "jobs")(http.HandlerFunc(h.Download.Get)))))
	mux.Handle("GET /api/v1/download-jobs/{id}/items", requireAuth(requireActive(limited(jobReadLimiter, "jobs")(http.HandlerFunc(h.Download.Items)))))
	mux.Handle("GET /api/v1/download-jobs/{id}/events", requireAuth(requireActive(http.HandlerFunc(h.Download.Events))))
	mux.Handle("POST /api/v1/download-jobs/{id}/cancel", requireAuth(requireActive(limited(jobReadLimiter, "jobs")(http.HandlerFunc(h.Download.Cancel)))))
	mux.Handle("GET /api/v1/files/{id}/content", requireAuth(requireActive(limited(fileReadLimiter, "files")(http.HandlerFunc(h.Download.FileContent)))))

	// --- administration ---
	mux.Handle("GET /api/v1/admin/dashboard", requireAuth(requireAdmin(http.HandlerFunc(h.Admin.Dashboard))))

	mux.Handle("GET /api/v1/admin/users", requireAuth(requireAdmin(http.HandlerFunc(h.Admin.Users))))
	mux.Handle("GET /api/v1/admin/users/{id}", requireAuth(requireAdmin(http.HandlerFunc(h.Admin.User))))
	mux.Handle("PATCH /api/v1/admin/users/{id}", requireAuth(requireAdmin(http.HandlerFunc(h.Admin.UpdateUser))))

	mux.Handle("GET /api/v1/admin/areas", requireAuth(requireAdmin(http.HandlerFunc(h.Org.AdminAreas))))
	mux.Handle("POST /api/v1/admin/areas", requireAuth(requireAdmin(http.HandlerFunc(h.Org.CreateArea))))
	mux.Handle("PATCH /api/v1/admin/areas/{id}", requireAuth(requireAdmin(http.HandlerFunc(h.Org.UpdateArea))))
	mux.Handle("GET /api/v1/admin/areas/{areaId}/positions", requireAuth(requireAdmin(http.HandlerFunc(h.Org.AdminPositions))))
	mux.Handle("POST /api/v1/admin/areas/{areaId}/positions", requireAuth(requireAdmin(http.HandlerFunc(h.Org.CreatePosition))))
	mux.Handle("PATCH /api/v1/admin/positions/{id}", requireAuth(requireAdmin(http.HandlerFunc(h.Org.UpdatePosition))))

	mux.Handle("GET /api/v1/admin/users/{userId}/drive/connection",
		requireAuth(requireAdmin(http.HandlerFunc(h.Drive.AdminConnection))))
	mux.Handle("GET /api/v1/admin/users/{userId}/drive/folders",
		requireAuth(requireAdmin(limited(driveBrowseLimiter, "drive-browse")(http.HandlerFunc(h.Drive.AdminFolders)))))
	mux.Handle("GET /api/v1/admin/drive-connections",
		requireAuth(requireAdmin(http.HandlerFunc(h.Drive.AdminConnections))))
	mux.Handle("POST /api/v1/admin/policies", requireAuth(requireAdmin(http.HandlerFunc(h.Drive.PublishPolicy))))

	mux.Handle("POST /api/v1/admin/users/{userId}/download-jobs",
		requireAuth(requireAdmin(limited(jobCreateLimiter, "job-create")(http.HandlerFunc(h.Download.AdminCreate)))))
	mux.Handle("GET /api/v1/admin/download-jobs", requireAuth(requireAdmin(http.HandlerFunc(h.Download.List))))
	mux.Handle("GET /api/v1/admin/download-jobs/{id}", requireAuth(requireAdmin(http.HandlerFunc(h.Download.Get))))
	mux.Handle("POST /api/v1/admin/download-jobs/{id}/cancel",
		requireAuth(requireAdmin(http.HandlerFunc(h.Download.Cancel))))
	mux.Handle("POST /api/v1/download-jobs/{id}/retry-failed",
		requireAuth(requireAdmin(http.HandlerFunc(h.Download.Retry))))
	mux.Handle("GET /api/v1/admin/storage", requireAuth(requireAdmin(http.HandlerFunc(h.Download.AdminStorage))))
	mux.Handle("GET /api/v1/admin/audit-events", requireAuth(requireAdmin(http.HandlerFunc(h.Admin.AuditEvents))))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{
			"error": map[string]any{"code": "not_found", "message": "Recurso no encontrado."},
		})
	})

	return httpx.Chain(mux,
		httpx.RequestID,
		httpx.Logger(log),
		httpx.Recoverer(log),
		httpx.SecurityHeaders,
	)
}
