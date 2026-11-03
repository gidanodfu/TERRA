// Package admin coordinates cross-module administrative use cases: dashboard,
// worker management, audit queries and organizational assignment.
package admin

import (
	"context"
	"github.com/google/uuid"

	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/audit"
	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/organization"
	"terra/internal/platform/apperr"
	"terra/internal/users"
)

type Service struct {
	users    *users.Repository
	org      *organization.Repository
	audit    *audit.Repository
	drive    *drive.Repository
	download *downloads.Repository
	pool     *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool, usersRepo *users.Repository, org *organization.Repository,
	auditRepo *audit.Repository, driveRepo *drive.Repository, downloadRepo *downloads.Repository) *Service {
	return &Service{pool: pool, users: usersRepo, org: org, audit: auditRepo, drive: driveRepo, download: downloadRepo}
}

func (s *Service) poolRef() *pgxpool.Pool { return s.pool }

type Dashboard struct {
	ActiveUsers       int           `json:"active_users"`
	PendingProfiles   int           `json:"pending_profiles"`
	SuspendedUsers    int           `json:"suspended_users"`
	Areas             int           `json:"areas"`
	Positions         int           `json:"positions"`
	QueuedJobs        int           `json:"queued_jobs"`
	RunningJobs       int           `json:"running_jobs"`
	WaitingAuthJobs   int           `json:"waiting_authorization_jobs"`
	CompletedJobs     int           `json:"completed_jobs"`
	FailedJobs        int           `json:"failed_jobs"`
	StoredBytes       int64         `json:"stored_bytes"`
	ConnectedDrives   int           `json:"connected_drives"`
	ReauthDrives      int           `json:"reauth_drives"`
	OldestQueueAgeSec int64         `json:"oldest_queue_age_seconds"`
	RecentAudit       []audit.Event `json:"recent_activity"`
}

func (s *Service) Dashboard(ctx context.Context) (*Dashboard, error) {
	d := &Dashboard{}
	err := s.downloadPoolQuery(ctx, d)
	if err != nil {
		return nil, err
	}
	d.RecentAudit, _, err = s.audit.List(ctx, audit.ListFilter{Page: 1, Size: 10})
	if err != nil {
		return nil, err
	}
	if d.RecentAudit == nil {
		d.RecentAudit = []audit.Event{}
	}
	return d, nil
}

// queryDashboard lives in repository.go to keep SQL out of this use case.
func (s *Service) downloadPoolQuery(ctx context.Context, d *Dashboard) error {
	return s.queryDashboard(ctx, d)
}

func (s *Service) Users(ctx context.Context, f users.ListFilter) ([]users.User, int, error) {
	list, total, err := s.users.List(ctx, f)
	if list == nil {
		list = []users.User{}
	}
	return list, total, err
}

type UserDetail struct {
	User            *users.User            `json:"user"`
	DriveConnection *drive.Connection      `json:"drive_connection,omitempty"`
	History         []organization.History `json:"organization_history"`
}

func (s *Service) User(ctx context.Context, id uuid.UUID) (*UserDetail, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	detail := &UserDetail{User: user, History: []organization.History{}}
	if conn, err := s.drive.GetByUser(ctx, id); err == nil {
		detail.DriveConnection = conn
	}
	history, err := s.org.History(ctx, id)
	if err == nil {
		detail.History = history
	}
	return detail, nil
}

type UpdateUserInput struct {
	AreaID     *uuid.UUID `json:"area_id"`
	PositionID *uuid.UUID `json:"position_id"`
	Status     *string    `json:"status"`
}

func (s *Service) UpdateUser(ctx context.Context, actor uuid.UUID, target uuid.UUID, in UpdateUserInput, ipHash string) (*users.User, error) {
	current, err := s.users.GetByID(ctx, target)
	if err != nil {
		return nil, err
	}
	areaID, positionID := current.AreaID, current.PositionID
	if in.AreaID != nil || in.PositionID != nil {
		if in.AreaID == nil || in.PositionID == nil {
			return nil, apperr.Invalid("Área y cargo deben actualizarse juntos.",
				map[string]string{"area_id": "Seleccione área y cargo.", "position_id": "Seleccione área y cargo."})
		}
		area, err := s.org.GetArea(ctx, *in.AreaID)
		if err != nil {
			return nil, err
		}
		if area.Status != "active" {
			return nil, apperr.Invalid("El área está inactiva.", map[string]string{"area_id": "Seleccione un área activa."})
		}
		if err := s.org.ValidatePositionForArea(ctx, *in.AreaID, *in.PositionID); err != nil {
			return nil, err
		}
		areaID, positionID = in.AreaID, in.PositionID
	}
	status := users.Status(current.Status)
	if in.Status != nil {
		status = users.Status(*in.Status)
		switch status {
		case users.StatusActive, users.StatusSuspended, users.StatusDisabled, users.StatusPendingProfile:
		default:
			return nil, apperr.Invalid("Estado de usuario inválido.", map[string]string{"status": "Estado inválido."})
		}
		if status == users.StatusActive && (areaID == nil || positionID == nil) {
			return nil, apperr.Invalid("Para activar al trabajador debe tener área y cargo.",
				map[string]string{"status": "Asigne área y cargo antes de activar."})
		}
		if target == actor && status != users.StatusActive {
			return nil, apperr.Conflict("cannot_suspend_self", "No puede suspender o desactivar su propia cuenta.")
		}
	}
	updated, err := s.users.AdminUpdate(ctx, target, areaID, positionID, status, actor)
	if err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "admin.user.updated", TargetType: "user",
		TargetID: target.String(), Metadata: map[string]any{"status": string(status)}, IPHash: ipHash})
	return updated, nil
}

func (s *Service) Audit(ctx context.Context, f audit.ListFilter) ([]audit.Event, int, error) {
	events, total, err := s.audit.List(ctx, f)
	if events == nil {
		events = []audit.Event{}
	}
	return events, total, err
}
