// El paquete bootstrap se encarga de la recuperación idempotente del identificador del
// administrador principal. Nunca sobrescribe un identificador existente.
package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnsureExistingPrincipal registra bootstrap_state.details.admin_user_id cuando el
// nombre de usuario de bootstrap ya existe, la cuenta realmente tiene el rol admin y
// aún no se ha almacenado ningún identificador. La operación es transaccional y preserva
// cualquier identificador existente, incluso uno inválido.
func EnsureExistingPrincipal(ctx context.Context, pool *pgxpool.Pool, username string, log *slog.Logger) error {
	if log == nil {
		log = slog.Default()
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var userID uuid.UUID
	var hasAdminRole bool
	err = tx.QueryRow(ctx, `SELECT lc.user_id, EXISTS(
			SELECT 1 FROM user_roles ur JOIN system_roles r ON r.id = ur.role_id
			WHERE ur.user_id = lc.user_id AND r.key = 'admin')
		FROM local_credentials lc WHERE lower(lc.username) = lower($1)`,
		strings.TrimSpace(username)).Scan(&userID, &hasAdminRole)
	if errors.Is(err, pgx.ErrNoRows) {
		log.Warn("bootstrap_principal_unresolved", "reason", "local credential not found")
		return nil
	}
	if err != nil {
		return err
	}

	var raw []byte
	err = tx.QueryRow(ctx, `SELECT details FROM bootstrap_state WHERE id = 1 FOR UPDATE`).Scan(&raw)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	details := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &details); err != nil {
			return fmt.Errorf("bootstrap_state.details inválido: %w", err)
		}
	}

	if !hasAdminRole {
		log.Warn("bootstrap_principal_unresolved", "reason", "account lacks admin role", "username", username)
		return nil
	}
	if _, exists := details["admin_user_id"]; exists {
		log.Info("bootstrap_principal_preserved", "username", username)
		return tx.Commit(ctx)
	}

	payload, err := json.Marshal(map[string]any{
		"admin_user_id": userID.String(),
		"username":      strings.TrimSpace(username),
	})
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO bootstrap_state (id, details) VALUES (1, $1::jsonb)
		ON CONFLICT (id) DO UPDATE SET details = bootstrap_state.details || $1::jsonb,
		completed_at = now()`, string(payload)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	log.Info("bootstrap_principal_recorded", "username", username)
	return nil
}
