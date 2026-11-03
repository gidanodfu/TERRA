package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/platform/apperr"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) CreateSession(ctx context.Context, userID uuid.UUID, tokenHash []byte, csrf string,
	expires time.Time, userAgent, ipHash string) (uuid.UUID, error) {
	id := uuid.New()
	_, err := r.pool.Exec(ctx, `INSERT INTO sessions
		(id, user_id, token_hash, csrf_token, expires_at, user_agent, ip_hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, id, userID, tokenHash, csrf, expires, userAgent, ipHash)
	return id, err
}

func (r *Repository) GetSession(ctx context.Context, tokenHash []byte) (*Session, error) {
	var s Session
	err := r.pool.QueryRow(ctx, `SELECT id, user_id, csrf_token, expires_at
		FROM sessions WHERE token_hash=$1 AND expires_at > now()`, tokenHash).
		Scan(&s.ID, &s.UserID, &s.CSRFToken, &s.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.Unauthorized("Sesión no válida o expirada.")
	}
	return &s, err
}

func (r *Repository) TouchSession(ctx context.Context, id uuid.UUID) {
	_, _ = r.pool.Exec(ctx, `UPDATE sessions SET last_seen_at = now() WHERE id=$1`, id)
}

func (r *Repository) DeleteSession(ctx context.Context, tokenHash []byte) {
	_, _ = r.pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash=$1`, tokenHash)
}

func (r *Repository) DeleteOtherSessions(ctx context.Context, userID uuid.UUID, keepTokenHash []byte) {
	_, _ = r.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2`, userID, keepTokenHash)
}

func (r *Repository) GetLocalCredential(ctx context.Context, username string) (*LocalCredential, error) {
	var c LocalCredential
	err := r.pool.QueryRow(ctx, `SELECT lc.user_id, lc.username, lc.password_hash, u.status, lc.must_rotate_password
		FROM local_credentials lc JOIN users u ON u.id = lc.user_id
		WHERE lower(lc.username) = lower($1)`, username).
		Scan(&c.UserID, &c.Username, &c.PasswordHash, &c.UserStatus, &c.MustRotatePassword)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.Unauthorized("Usuario o contraseña incorrectos.")
	}
	return &c, err
}

func (r *Repository) UpdatePassword(ctx context.Context, userID uuid.UUID, hash string) error {
	ct, err := r.pool.Exec(ctx, `UPDATE local_credentials
		SET password_hash=$2, password_changed_at=now(), must_rotate_password=false WHERE user_id=$1`, userID, hash)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return apperr.BadRequest("La cuenta no tiene credenciales locales.")
	}
	return nil
}

func (r *Repository) HasLocalCredential(ctx context.Context, userID uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM local_credentials WHERE user_id=$1)`, userID).Scan(&exists)
	return exists, err
}

func (r *Repository) PurgeExpired(ctx context.Context) {
	_, _ = r.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now() - interval '1 day'`)
	_, _ = r.pool.Exec(ctx, `DELETE FROM oauth_states WHERE expires_at < now() - interval '1 day'`)
}

func (r *Repository) GetLocalCredentialByUserID(ctx context.Context, userID uuid.UUID) (*LocalCredential, error) {
	var c LocalCredential
	err := r.pool.QueryRow(ctx, `SELECT lc.user_id, lc.username, lc.password_hash, u.status, lc.must_rotate_password
		FROM local_credentials lc JOIN users u ON u.id = lc.user_id WHERE lc.user_id = $1`, userID).
		Scan(&c.UserID, &c.Username, &c.PasswordHash, &c.UserStatus, &c.MustRotatePassword)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.BadRequest("La cuenta no tiene credenciales locales.")
	}
	return &c, err
}

func (r *Repository) HasLocalCredentialFlag(ctx context.Context, userID uuid.UUID) (bool, error) {
	var mustRotate bool
	err := r.pool.QueryRow(ctx, `SELECT must_rotate_password FROM local_credentials WHERE user_id=$1`, userID).
		Scan(&mustRotate)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return mustRotate, err
}
