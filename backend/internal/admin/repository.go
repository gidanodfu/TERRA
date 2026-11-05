package admin

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"terra/internal/audit"
	"terra/internal/platform/apperr"
	"terra/internal/users"
)

type createAdministrativeRecord struct {
	ID           uuid.UUID
	FirstName    string
	LastName     string
	DisplayName  string
	Username     string
	PasswordHash string
	Role         string
}

func (s *Service) createAdministrativeAccountRecord(ctx context.Context, rec createAdministrativeRecord,
	actor uuid.UUID, ipHash string) (*users.User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `INSERT INTO users
		(id, first_name, last_name, display_name, status) VALUES ($1,$2,$3,$4,'active')`,
		rec.ID, rec.FirstName, rec.LastName, rec.DisplayName); err != nil {
		return nil, mapUsernameConflict(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO local_credentials
		(user_id, username, password_hash, must_rotate_password) VALUES ($1,$2,$3,true)`,
		rec.ID, rec.Username, rec.PasswordHash); err != nil {
		return nil, mapUsernameConflict(err)
	}
	ct, err := tx.Exec(ctx, `INSERT INTO user_roles (user_id, role_id, granted_by)
		SELECT $1, id, $3 FROM system_roles WHERE key = $2
		AND key IN ('admin','moderator','read_only')`, rec.ID, rec.Role, actor)
	if err != nil {
		return nil, err
	}
	if ct.RowsAffected() != 1 {
		return nil, apperr.Invalid("Rol administrativo inválido.", map[string]string{"role": "Seleccione un rol válido."})
	}
	if err := s.audit.RecordTx(ctx, tx, audit.Event{ActorUserID: &actor, Action: "admin.account.created",
		TargetType: "user", TargetID: rec.ID.String(), Metadata: map[string]any{
			"kind": "administrative", "role": rec.Role, "username": rec.Username, "result": "created",
		}, IPHash: ipHash}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.users.GetByID(ctx, rec.ID)
}

func mapUsernameConflict(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return apperr.Conflict("username_taken", "El nombre de usuario ya está en uso.")
	}
	return err
}

func (s *Service) queryDashboard(ctx context.Context, d *Dashboard) error {
	return s.poolRef().QueryRow(ctx, `WITH workers AS (
			SELECT u.* FROM users u
			WHERE EXISTS (
				SELECT 1 FROM user_roles wur JOIN system_roles wsr ON wsr.id = wur.role_id
				WHERE wur.user_id = u.id AND wsr.key = 'user')
			AND NOT EXISTS (
				SELECT 1 FROM user_roles xur JOIN system_roles xsr ON xsr.id = xur.role_id
				WHERE xur.user_id = u.id AND xsr.key <> 'user')
		)
		SELECT
		(SELECT count(*) FROM workers WHERE status='active'),
		(SELECT count(*) FROM workers WHERE status='pending_profile'),
		(SELECT count(*) FROM workers WHERE status='suspended'),
		(SELECT count(*) FROM areas),
		(SELECT count(*) FROM positions),
		(SELECT count(*) FROM download_jobs WHERE status='queued'),
		(SELECT count(*) FROM download_jobs WHERE status IN ('scanning','downloading','cancel_requested')),
		(SELECT count(*) FROM download_jobs WHERE status='waiting_authorization'),
		(SELECT count(*) FROM download_jobs WHERE status='completed'),
		(SELECT count(*) FROM download_jobs WHERE status IN ('failed','partially_completed')),
		(SELECT COALESCE(sum(size_bytes),0) FROM stored_files),
		(SELECT count(*) FROM drive_connections WHERE status='connected'),
		(SELECT count(*) FROM drive_connections WHERE status='reauthorization_required'),
		COALESCE((SELECT EXTRACT(EPOCH FROM now() - min(created_at))::bigint FROM download_jobs
			WHERE status IN ('queued','waiting_authorization')), 0)`,
	).Scan(&d.ActiveUsers, &d.PendingProfiles, &d.SuspendedUsers, &d.Areas, &d.Positions,
		&d.QueuedJobs, &d.RunningJobs, &d.WaitingAuthJobs, &d.CompletedJobs, &d.FailedJobs,
		&d.StoredBytes, &d.ConnectedDrives, &d.ReauthDrives, &d.OldestQueueAgeSec)
}
