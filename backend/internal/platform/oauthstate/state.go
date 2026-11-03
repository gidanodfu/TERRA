// Package oauthstate persists single-use OAuth state values with PKCE verifiers.
// It is shared by identity login and the separate Drive authorization flow.
package oauthstate

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/platform/apperr"
)

const (
	FlowLogin        = "login"
	FlowDriveConnect = "drive_connect"
)

type State struct {
	ID            uuid.UUID
	Flow          string
	UserID        *uuid.UUID
	CodeVerifier  string
	RedirectAfter string
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) Create(ctx context.Context, stateHash []byte, flow string, userID *uuid.UUID,
	verifier, redirectAfter string, expires time.Time) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO oauth_states
		(id, state_hash, flow, user_id, code_verifier, redirect_after, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		uuid.New(), stateHash, flow, userID, verifier, redirectAfter, expires)
	return err
}

// Consume is atomic: a state value succeeds once, then is unusable.
func (r *Repository) Consume(ctx context.Context, stateHash []byte, flow string) (*State, error) {
	var s State
	err := r.pool.QueryRow(ctx, `UPDATE oauth_states SET consumed_at = now()
		WHERE state_hash=$1 AND flow=$2 AND consumed_at IS NULL AND expires_at > now()
		RETURNING id, flow, user_id, COALESCE(code_verifier,''), COALESCE(redirect_after,'')`,
		stateHash, flow).
		Scan(&s.ID, &s.Flow, &s.UserID, &s.CodeVerifier, &s.RedirectAfter)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.BadRequest("La autorización expiró o ya fue utilizada. Intente nuevamente.")
	}
	return &s, err
}
