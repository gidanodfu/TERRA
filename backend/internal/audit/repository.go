// El paquete audit almacena operaciones administrativas sensibles. Los secretos y el
// contenido de documentos nunca se escriben aquí.
package audit

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	ID          int64          `json:"id"`
	ActorUserID *uuid.UUID     `json:"actor_user_id,omitempty"`
	ActorName   string         `json:"actor_name,omitempty"`
	Action      string         `json:"action"`
	TargetType  string         `json:"target_type"`
	TargetID    string         `json:"target_id,omitempty"`
	Metadata    map[string]any `json:"metadata"`
	IPHash      string         `json:"-"`
	CreatedAt   time.Time      `json:"created_at"`
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

type execer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func (r *Repository) Record(ctx context.Context, ev Event) {
	_ = r.record(ctx, r.pool, ev)
}

// RecordTx registra el evento dentro de la transacción indicada.
func (r *Repository) RecordTx(ctx context.Context, tx pgx.Tx, ev Event) error {
	return r.record(ctx, tx, ev)
}

func (r *Repository) record(ctx context.Context, ex execer, ev Event) error {
	meta := ev.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	raw, err := json.Marshal(meta)
	if err != nil {
		raw = []byte("{}")
	}
	_, err = ex.Exec(ctx, `INSERT INTO audit_events
		(actor_user_id, action, target_type, target_id, metadata_json, ip_hash)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		ev.ActorUserID, ev.Action, ev.TargetType, nullString(ev.TargetID), raw, nullString(ev.IPHash))
	return err
}

// Scope determina qué eventos puede recuperar la consulta.
type Scope string

const (
	ScopeFull        Scope = "full"
	ScopeOperational Scope = "operational"
)

// operationalActions es la allowlist explícita de la auditoría operacional.
// No se usan comodines: cualquier acción nueva debe añadirse aquí de forma deliberada.
var operationalActions = []string{
	"admin.user.updated",
	"user.profile.updated",
	"drive.connected",
	"drive.disconnected",
	"download_job.created",
	"download_job.cancel_requested",
	"download_job.retried",
	"policy.accepted",
}

var operationalMetadataFields = map[string][]string{
	"admin.user.updated":            {"kind", "previous_status", "status", "area_id", "position_id", "result"},
	"user.profile.updated":          {"area_id", "position_id"},
	"download_job.created":          {"scope_type", "roots", "file_roots", "selected_total"},
	"download_job.cancel_requested": {},
	"download_job.retried":          {},
	"drive.connected":               {},
	"drive.disconnected":            {},
	"policy.accepted":               {},
}

// OperationalActions devuelve una copia de la allowlist para pruebas y documentación.
func OperationalActions() []string {
	out := make([]string, len(operationalActions))
	copy(out, operationalActions)
	return out
}

type ListFilter struct {
	Action  string
	ActorID *uuid.UUID
	From    *time.Time
	To      *time.Time
	Page    int
	Size    int
	Scope   Scope
}

func (r *Repository) List(ctx context.Context, f ListFilter) ([]Event, int, error) {
	where := " WHERE 1=1"
	args := []any{}
	if f.Scope == ScopeOperational {
		placeholders := make([]string, 0, len(operationalActions))
		for _, action := range operationalActions {
			args = append(args, action)
			placeholders = append(placeholders, "$"+itoa(len(args)))
		}
		where += " AND a.action IN (" + strings.Join(placeholders, ",") + ")"
		where += " AND (a.action <> 'admin.user.updated' OR a.metadata_json->>'kind' = 'worker')"
	}
	if f.Action != "" {
		args = append(args, f.Action)
		where += " AND a.action = $" + itoa(len(args))
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
		if f.Scope == ScopeOperational {
			ev.Metadata = sanitizeOperational(ev.Action, ev.Metadata)
		}
		if ev.Metadata == nil {
			ev.Metadata = map[string]any{}
		}
		out = append(out, ev)
	}
	return out, total, rows.Err()
}

func sanitizeOperational(action string, metadata map[string]any) map[string]any {
	allowed := operationalMetadataFields[action]
	out := map[string]any{}
	for _, field := range allowed {
		if value, ok := metadata[field]; ok {
			out[field] = value
		}
	}
	return out
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
