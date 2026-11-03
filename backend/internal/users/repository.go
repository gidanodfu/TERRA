package users

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/platform/apperr"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const userColumns = `
	u.id, COALESCE(u.first_name,''), COALESCE(u.last_name,''), COALESCE(u.display_name,''),
	COALESCE(u.email,''), u.area_id, COALESCE(a.name,''), COALESCE(a.slug,''),
	u.position_id, COALESCE(p.name,''), COALESCE(p.slug,''),
	u.status, u.created_at, u.updated_at, u.last_login_at,
	COALESCE(array_agg(r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS roles`

const userJoins = `
	FROM users u
	LEFT JOIN areas a ON a.id = u.area_id
	LEFT JOIN positions p ON p.id = u.position_id
	LEFT JOIN user_roles ur ON ur.user_id = u.id
	LEFT JOIN system_roles r ON r.id = ur.role_id`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.FirstName, &u.LastName, &u.DisplayName, &u.Email,
		&u.AreaID, &u.AreaName, &u.AreaSlug, &u.PositionID, &u.PositionName, &u.PositionSlug,
		&u.Status, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt, &u.Roles)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Usuario no encontrado.")
		}
		return nil, err
	}
	return &u, nil
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	q := "SELECT " + userColumns + userJoins + " WHERE u.id = $1 GROUP BY u.id, a.name, a.slug, p.name, p.slug"
	return scanUser(r.pool.QueryRow(ctx, q, id))
}

func (r *Repository) GetByGoogleSubject(ctx context.Context, subject string) (*User, error) {
	q := "SELECT " + userColumns + userJoins + `
		JOIN auth_identities ai ON ai.user_id = u.id
		WHERE ai.provider = 'google' AND ai.provider_subject = $1
		GROUP BY u.id, a.name, a.slug, p.name, p.slug`
	return scanUser(r.pool.QueryRow(ctx, q, subject))
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*User, error) {
	q := "SELECT " + userColumns + userJoins + " WHERE lower(u.email) = lower($1) GROUP BY u.id, a.name, a.slug, p.name, p.slug"
	return scanUser(r.pool.QueryRow(ctx, q, email))
}

func (r *Repository) CreateGoogleUser(ctx context.Context, email, displayName, subject string) (*User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	id := uuid.New()
	if _, err := tx.Exec(ctx, `INSERT INTO users (id, display_name, email, status)
		VALUES ($1, $2, $3, 'pending_profile')`, id, displayName, email); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO auth_identities (id, user_id, provider, provider_subject)
		VALUES ($1, $2, 'google', $3)`, uuid.New(), id, subject); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_roles (user_id, role_id)
		SELECT $1, id FROM system_roles WHERE key = 'user'`, id); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetByID(ctx, id)
}

func (r *Repository) TouchIdentity(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE auth_identities SET last_used_at = now()
		WHERE user_id = $1 AND provider = 'google'`, userID)
	return err
}

func (r *Repository) TouchLogin(ctx context.Context, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`, userID)
	return err
}

type UpdateProfileInput struct {
	FirstName  string     `json:"first_name"`
	LastName   string     `json:"last_name"`
	AreaID     *uuid.UUID `json:"area_id"`
	PositionID *uuid.UUID `json:"position_id"`
}

func (r *Repository) UpdateProfile(ctx context.Context, userID uuid.UUID, in UpdateProfileInput, actorID uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var prevArea, prevPosition *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT area_id, position_id FROM users WHERE id = $1 FOR UPDATE`, userID).
		Scan(&prevArea, &prevPosition); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apperr.NotFound("Usuario no encontrado.")
		}
		return err
	}

	if _, err := tx.Exec(ctx, `UPDATE users SET first_name = $2, last_name = $3, area_id = $4, position_id = $5,
		display_name = btrim($2 || ' ' || $3), status = CASE WHEN status = 'pending_profile' THEN 'active' ELSE status END,
		updated_at = now() WHERE id = $1`,
		userID, in.FirstName, in.LastName, in.AreaID, in.PositionID); err != nil {
		return err
	}

	if prevArea != in.AreaID || prevPosition != in.PositionID {
		if _, err := tx.Exec(ctx, `INSERT INTO organization_history
			(user_id, area_id, position_id, previous_area_id, previous_position_id, actor_user_id)
			VALUES ($1,$2,$3,$4,$5,$6)`, userID, in.AreaID, in.PositionID, prevArea, prevPosition, actorID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type ListFilter struct {
	Query      string
	AreaID     *uuid.UUID
	PositionID *uuid.UUID
	Status     string
	Page       int
	Size       int
}

func (r *Repository) List(ctx context.Context, f ListFilter) ([]User, int, error) {
	where := []string{"1=1"}
	args := []any{}
	add := func(clause string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if f.Query != "" {
		args = append(args, "%"+f.Query+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(
			"(u.first_name ILIKE $%d OR u.last_name ILIKE $%d OR u.email ILIKE $%d)", n, n, n))
	}
	if f.AreaID != nil {
		add("u.area_id = $%d", *f.AreaID)
	}
	if f.PositionID != nil {
		add("u.position_id = $%d", *f.PositionID)
	}
	if f.Status != "" {
		add("u.status = $%d", f.Status)
	}
	whereSQL := strings.Join(where, " AND ")

	var total int
	if err := r.pool.QueryRow(ctx, "SELECT count(*) FROM users u WHERE "+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (f.Page - 1) * f.Size
	args = append(args, f.Size, offset)
	q := "SELECT " + userColumns + userJoins + " WHERE " + whereSQL +
		" GROUP BY u.id, a.name, a.slug, p.name, p.slug ORDER BY u.created_at DESC LIMIT $" +
		fmt.Sprint(len(args)-1) + " OFFSET $" + fmt.Sprint(len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *u)
	}
	return out, total, rows.Err()
}

// AdminUpdate applies organisational or status changes and records history.
func (r *Repository) AdminUpdate(ctx context.Context, userID uuid.UUID, areaID, positionID *uuid.UUID, status Status, actorID uuid.UUID) (*User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var prevArea, prevPosition *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT area_id, position_id FROM users WHERE id = $1 FOR UPDATE`, userID).
		Scan(&prevArea, &prevPosition); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Usuario no encontrado.")
		}
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET area_id=$2, position_id=$3, status=$4, updated_at=now()
		WHERE id=$1`, userID, areaID, positionID, status); err != nil {
		return nil, err
	}
	if prevArea != areaID || prevPosition != positionID {
		if _, err := tx.Exec(ctx, `INSERT INTO organization_history
			(user_id, area_id, position_id, previous_area_id, previous_position_id, actor_user_id)
			VALUES ($1,$2,$3,$4,$5,$6)`, userID, areaID, positionID, prevArea, prevPosition, actorID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.GetByID(ctx, userID)
}

func (r *Repository) CountActive(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE status = 'active'`).Scan(&n)
	return n, err
}

func (r *Repository) AttachGoogleIdentity(ctx context.Context, userID uuid.UUID, subject string) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO auth_identities (id, user_id, provider, provider_subject)
		VALUES ($1,$2,'google',$3) ON CONFLICT (provider, provider_subject) DO NOTHING`, uuid.New(), userID, subject)
	return err
}

func (r *Repository) EnsureRole(ctx context.Context, userID uuid.UUID, role string) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO user_roles (user_id, role_id)
		SELECT $1, id FROM system_roles WHERE key = $2 ON CONFLICT DO NOTHING`, userID, role)
	return err
}

func (r *Repository) SetDisplayNameIfEmpty(ctx context.Context, userID uuid.UUID, name string) {
	_, _ = r.pool.Exec(ctx, `UPDATE users SET display_name = $2, updated_at = now()
		WHERE id = $1 AND (display_name IS NULL OR btrim(display_name) = '')`, userID, name)
}
