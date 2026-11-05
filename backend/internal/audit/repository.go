// El paquete audit almacena operaciones administrativas sensibles. Los secretos y el
// contenido de documentos nunca se escriben aquí.
package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	ID          int64          `json:"id"`
	ActorUserID *uuid.UUID     `json:"actor_user_id,omitempty"`
	ActorName   string         `json:"actor_name,omitempty"`
	Action      string         `json:"action"`
	TargetType  string         `json:"target_type"`
	TargetID    string         `json:"target_id,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
	IPHash      string         `json:"-"`
	CreatedAt   time.Time      `json:"created_at"`
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) Record(ctx context.Context, ev Event) {
	meta := ev.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	raw, err := json.Marshal(meta)
	if err != nil {
		raw = []byte("{}")
	}
	_, _ = r.pool.Exec(ctx, `INSERT INTO audit_events
		(actor_user_id, action, target_type, target_id, metadata_json, ip_hash)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		ev.ActorUserID, ev.Action, ev.TargetType, nullString(ev.TargetID), raw, nullString(ev.IPHash))
}

type ListFilter struct {
	Action  string
	ActorID *uuid.UUID
	From    *time.Time
	To      *time.Time
	Page    int
	Size    int
}

func (r *Repository) List(ctx context.Context, f ListFilter) ([]Event, int, error) {
	where := " WHERE 1=1"
	args := []any{}
	if f.Action != "" {
		args = append(args, f.Action)
		where += " AND a.action = $1"
	}
	if f.ActorID != nil {
		args = append(args, *f.ActorID)
		where += " AND a.actor_user_id = $" + itoa(len(args))
	}
	if f.From != nil {
		args = append(args, *f.From)
		where += " AND a.created_at >= $" + itoa(len(args))
	}
	if f.To != nil {
		args = append(args, *f.To)
		where += " AND a.created_at <= $" + itoa(len(args))
	}
	var total int
	if err := r.pool.QueryRow(ctx, "SELECT count(*) FROM audit_events a"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, f.Size, (f.Page-1)*f.Size)
	rows, err := r.pool.Query(ctx, `SELECT a.id, a.actor_user_id,
		COALESCE(NULLIF(btrim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.display_name, 'Sistema'),
		a.action, a.target_type, COALESCE(a.target_id,''), a.metadata_json, a.created_at
		FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id`+where+`
		ORDER BY a.created_at DESC LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var ev Event
		var raw []byte
		if err := rows.Scan(&ev.ID, &ev.ActorUserID, &ev.ActorName, &ev.Action, &ev.TargetType,
			&ev.TargetID, &raw, &ev.CreatedAt); err != nil {
			return nil, 0, err
		}
		_ = json.Unmarshal(raw, &ev.Metadata)
		out = append(out, ev)
	}
	return out, total, rows.Err()
}

func nullString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [4]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
