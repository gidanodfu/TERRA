package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/auth"
	"terra/internal/downloads"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/platform/crypto"
	"terra/internal/platform/principal"
	"terra/internal/platform/rbac"
	"terra/internal/users"
)

type Service struct {
	cfg       config.Config
	log       *slog.Logger
	hub       *Hub
	pool      *pgxpool.Pool
	downloads *downloads.Service
	repo      *downloads.Repository
	authRepo  *auth.Repository
	users     *users.Repository
	dashboard func(context.Context, bool) (any, error)
	dashMu    sync.Mutex
	lastDash  time.Time
}

func (s *Service) Close() { s.hub.CloseAll() }

func NewService(cfg config.Config, log *slog.Logger, pool *pgxpool.Pool, downloadSvc *downloads.Service,
	repo *downloads.Repository, authRepo *auth.Repository, usersRepo *users.Repository,
	dashboard func(context.Context, bool) (any, error)) *Service {
	return &Service{
		cfg: cfg, log: log, hub: NewHub(), pool: pool, downloads: downloadSvc, repo: repo,
		authRepo: authRepo, users: usersRepo, dashboard: dashboard,
	}
}

type clientMessage struct {
	Type        string `json:"type"`
	Channel     string `json:"channel"`
	LastEventID int64  `json:"last_event_id,omitempty"`
}

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if origin := strings.TrimSpace(r.Header.Get("Origin")); origin != "" &&
		strings.TrimRight(origin, "/") != strings.TrimRight(s.cfg.PublicURL, "/") {
		http.Error(w, "origen no permitido", http.StatusForbidden)
		return
	}
	identity, err := s.authenticate(r)
	if err != nil {
		http.Error(w, "sesión no válida", http.StatusUnauthorized)
		return
	}

	originPatterns := []string{}
	if public, err := url.Parse(s.cfg.PublicURL); err == nil && public.Host != "" {
		originPatterns = append(originPatterns, public.Host)
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: originPatterns})
	if err != nil {
		s.log.Debug("realtime_accept_failed", "error", err)
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(4096)

	client := newClient(r.Context(), conn)
	client.identity = identity
	s.hub.Add(client)
	defer s.hub.Remove(client)

	client.enqueue(Message{
		Type: "connection.ready", At: time.Now().UTC(),
		Data: map[string]any{"user_id": identity.ID, "channels": []string{"job:<uuid>", "admin.dashboard"}},
	})
	go client.writeLoop(s.log)

	for {
		messageType, raw, err := conn.Read(client.ctx)
		if err != nil {
			return
		}
		if messageType != websocket.MessageText {
			client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
				Data: map[string]any{"message": "Solo se admiten mensajes de texto."}})
			continue
		}
		var message clientMessage
		if err := json.Unmarshal(raw, &message); err != nil {
			client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
				Data: map[string]any{"message": "Mensaje inválido."}})
			continue
		}
		switch message.Type {
		case "subscribe":
			s.subscribe(client, identity, message)
		case "unsubscribe":
			if message.Channel == "admin.dashboard" || strings.HasPrefix(message.Channel, "job:") {
				client.removeSubscription(message.Channel)
			}
		default:
			client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
				Data: map[string]any{"message": "Tipo de mensaje no permitido."}})
		}
	}
}

func (s *Service) subscribe(client *Client, identity principal.Identity, message clientMessage) {
	if message.Channel == "admin.dashboard" {
		if !identity.Can(rbac.PermDashboardRead) {
			client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
				Data: map[string]any{"message": "No tiene permisos para el dashboard."}})
			return
		}
		if !client.addSubscription(message.Channel) {
			client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
				Data: map[string]any{"message": "Límite de suscripciones alcanzado."}})
			return
		}
		if snapshot, err := s.dashboard(context.Background(), identity.Can(rbac.PermAuditRead)); err == nil {
			client.enqueue(Message{Type: "dashboard.snapshot", At: time.Now().UTC(), Data: snapshot})
		}
		return
	}
	jobID, ok := parseJobChannel(message.Channel)
	if !ok {
		client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
			Data: map[string]any{"message": "Canal inválido."}})
		return
	}
	job, err := s.downloads.Get(context.Background(), identity.ID, identity.Can(rbac.PermJobsRead), jobID)
	if err != nil {
		client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
			Data: map[string]any{"message": "No tiene acceso a este trabajo.", "job_id": jobID}})
		return
	}
	if !client.addSubscription(message.Channel) {
		client.enqueue(Message{Type: "realtime.error", At: time.Now().UTC(),
			Data: map[string]any{"message": "Límite de suscripciones alcanzado."}})
		return
	}
	progress, revision := s.jobProgress(context.Background(), job)
	client.enqueue(Message{Type: "job.snapshot", Revision: revision, At: time.Now().UTC(),
		Data: map[string]any{"job_id": job.ID, "job": job, "progress": progress}})

	events, err := s.repo.EventsAfter(context.Background(), jobID, message.LastEventID, 100)
	if err != nil {
		return
	}
	for _, event := range events {
		client.enqueue(eventMessage(jobID, event, progress, revision))
	}
}

func (s *Service) authenticate(r *http.Request) (principal.Identity, error) {
	cookie, err := r.Cookie(s.cfg.SessionCookie)
	if err != nil || cookie.Value == "" {
		return principal.Identity{}, errors.New("sin sesión")
	}
	session, err := s.authRepo.GetSession(r.Context(), crypto.HashToken(cookie.Value))
	if err != nil {
		return principal.Identity{}, err
	}
	user, err := s.users.GetByID(r.Context(), session.UserID)
	if err != nil {
		return principal.Identity{}, err
	}
	if user.Status != users.StatusActive {
		return principal.Identity{}, errors.New("cuenta inactiva")
	}
	s.authRepo.TouchSession(r.Context(), session.ID)
	return principal.Identity{
		ID: user.ID, FirstName: user.FirstName, LastName: user.LastName, DisplayName: user.DisplayName,
		Email: user.Email, AreaID: user.AreaID, PositionID: user.PositionID,
		Status: string(user.Status), Roles: user.Roles, Permissions: auth.PermissionsFor(user.Roles),
	}, nil
}

func (s *Service) jobProgress(ctx context.Context, job *downloads.Job) (*downloads.ProgressSnapshot, int64) {
	progress, revision, err := s.repo.GetProgress(ctx, job.ID)
	if err == nil {
		return progress, revision
	}
	var appErr *apperr.Error
	if errors.As(err, &appErr) && appErr.Status == http.StatusNotFound {
		progress, err = s.repo.BuildProgress(ctx, job, nil)
		if err == nil {
			return progress, 0
		}
	}
	return nil, 0
}

// RunListener mantiene una conexión dedicada a LISTEN con reconexión y backoff.
func (s *Service) RunListener(ctx context.Context, dsn string) {
	delay := time.Second
	for ctx.Err() == nil {
		conn, err := pgx.Connect(ctx, dsn)
		if err != nil {
			s.log.Warn("realtime_listen_connect_failed", "error", err, "retry_in", delay)
			if !sleep(ctx, delay) {
				return
			}
			if delay < 30*time.Second {
				delay *= 2
			}
			continue
		}
		_, err = conn.Exec(ctx, "LISTEN terra_progress; LISTEN terra_events")
		if err == nil {
			delay = time.Second
			for ctx.Err() == nil {
				notification, waitErr := conn.WaitForNotification(ctx)
				if waitErr != nil {
					err = waitErr
					break
				}
				s.handleNotification(ctx, notification.Channel, notification.Payload)
			}
		}
		_ = conn.Close(context.Background())
		if ctx.Err() != nil {
			return
		}
		s.log.Warn("realtime_listen_lost", "error", err, "retry_in", delay)
		if !sleep(ctx, delay) {
			return
		}
		if delay < 30*time.Second {
			delay *= 2
		}
	}
}

func (s *Service) handleNotification(ctx context.Context, channel, payload string) {
	switch channel {
	case "terra_progress":
		jobID, err := uuid.Parse(strings.TrimSpace(payload))
		if err != nil {
			return
		}
		progress, revision, err := s.repo.GetProgress(ctx, jobID)
		if err != nil {
			return
		}
		s.hub.Broadcast(channelForJob(jobID), Message{Type: "job.progress", Revision: revision,
			At: time.Now().UTC(), Data: map[string]any{"job_id": jobID, "progress": progress}})
	case "terra_events":
		parts := strings.SplitN(payload, ":", 2)
		if len(parts) != 2 {
			return
		}
		jobID, err := uuid.Parse(parts[0])
		if err != nil {
			return
		}
		var eventID int64
		if _, err := fmt.Sscanf(parts[1], "%d", &eventID); err != nil {
			return
		}
		event, err := s.repo.EventByID(ctx, eventID)
		if err != nil {
			return
		}
		job, err := s.repo.Get(ctx, jobID)
		if err != nil {
			return
		}
		progress, revision := s.jobProgress(ctx, job)
		s.hub.Broadcast(channelForJob(jobID), eventMessage(jobID, *event, progress, revision))
	}
	s.BroadcastDashboard(ctx)
}

func eventMessage(jobID uuid.UUID, event downloads.JobEvent, progress *downloads.ProgressSnapshot, revision int64) Message {
	return Message{Type: eventType(event.Type), Revision: revision, EventID: event.ID, At: time.Now().UTC(),
		Data: map[string]any{
			"job_id": jobID, "event_id": event.ID, "event_type": event.Type,
			"payload": event.Payload, "progress": progress,
		}}
}

func eventType(eventType string) string {
	switch eventType {
	case "item.started", "item.progress", "item.completed", "item.skipped", "item.failed", "item.retrying":
		return "job." + eventType
	case "job.done":
		return "job.done"
	case "job.progress":
		return "job.progress"
	default:
		return "job.stage"
	}
}

func (s *Service) BroadcastDashboard(ctx context.Context) {
	if s.dashboard == nil {
		return
	}
	s.dashMu.Lock()
	if time.Since(s.lastDash) < 750*time.Millisecond {
		s.dashMu.Unlock()
		return
	}
	s.lastDash = time.Now()
	s.dashMu.Unlock()
	full, err := s.dashboard(ctx, true)
	if err != nil {
		return
	}
	operational, err := s.dashboard(ctx, false)
	if err != nil {
		return
	}
	for _, client := range s.hub.Clients("admin.dashboard") {
		snapshot := operational
		if client.identity.Can(rbac.PermAuditRead) {
			snapshot = full
		}
		client.enqueue(Message{Type: "dashboard.metrics", At: time.Now().UTC(), Data: snapshot})
	}
}

func sleep(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}
