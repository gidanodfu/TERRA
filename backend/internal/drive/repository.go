package drive

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/platform/apperr"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const connectionColumns = `
	c.id, c.user_id, c.google_subject, COALESCE(c.google_email,''), c.refresh_token_ciphertext,
	c.scopes, c.status, c.connected_at, c.last_refreshed_at, COALESCE(c.last_error_code,''),
	COALESCE(c.policy_consent_version,''), c.policy_consent_at, c.policy_consent_by_user_id`

func scanConnection(row pgx.Row) (*Connection, error) {
	var c Connection
	err := row.Scan(&c.ID, &c.UserID, &c.GoogleSubject, &c.GoogleEmail, &c.RefreshCiphertext,
		&c.Scopes, &c.Status, &c.ConnectedAt, &c.LastRefreshedAt, &c.LastErrorCode,
		&c.PolicyVersion, &c.PolicyConsentAt, &c.PolicyConsentBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("El trabajador no tiene una conexión de Google Drive.")
	}
	if err != nil {
		return nil, err
	}
	c.HasRefreshToken = len(c.RefreshCiphertext) > 0
	return &c, nil
}

func (r *Repository) GetByUser(ctx context.Context, userID uuid.UUID) (*Connection, error) {
	return scanConnection(r.pool.QueryRow(ctx, `SELECT `+connectionColumns+`
		FROM drive_connections c WHERE c.user_id=$1`, userID))
}

func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Connection, error) {
	return scanConnection(r.pool.QueryRow(ctx, `SELECT `+connectionColumns+`
		FROM drive_connections c WHERE c.id=$1`, id))
}

func (r *Repository) GetByGoogleSubject(ctx context.Context, subject string) (*Connection, error) {
	return scanConnection(r.pool.QueryRow(ctx, `SELECT `+connectionColumns+`
		FROM drive_connections c WHERE c.google_subject=$1`, subject))
}

func (r *Repository) Upsert(ctx context.Context, userID uuid.UUID, subject, email string, ciphertext []byte, scopes string) (*Connection, error) {
	_, err := r.pool.Exec(ctx, `INSERT INTO drive_connections
		(id, user_id, google_subject, google_email, refresh_token_ciphertext, scopes, status)
		VALUES ($1,$2,$3,$4,$5,$6,'connected')
		ON CONFLICT (user_id) DO UPDATE SET
			google_subject = EXCLUDED.google_subject,
			google_email = EXCLUDED.google_email,
			refresh_token_ciphertext = COALESCE(EXCLUDED.refresh_token_ciphertext, drive_connections.refresh_token_ciphertext),
			scopes = EXCLUDED.scopes,
			status = 'connected',
			connected_at = now(),
			last_error_code = NULL`,
		uuid.New(), userID, subject, email, ciphertext, scopes)
	if err != nil {
		if strings.Contains(err.Error(), "drive_connections_subject_unique") {
			return nil, apperr.Conflict("subject_already_linked",
				"Esa cuenta de Google ya está vinculada a otro trabajador de TERRA.")
		}
		return nil, err
	}
	return r.GetByUser(ctx, userID)
}

func (r *Repository) SetStatus(ctx context.Context, id uuid.UUID, status ConnectionStatus, errorCode string) error {
	_, err := r.pool.Exec(ctx, `UPDATE drive_connections SET status=$2, last_error_code=NULLIF($3,'') WHERE id=$1`,
		id, status, errorCode)
	return err
}

func (r *Repository) SetStatusByUser(ctx context.Context, userID uuid.UUID, status ConnectionStatus, errorCode string) error {
	_, err := r.pool.Exec(ctx, `UPDATE drive_connections SET status=$2, last_error_code=NULLIF($3,'') WHERE user_id=$1`,
		userID, status, errorCode)
	return err
}

func (r *Repository) Revoke(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE drive_connections
		SET status='revoked', refresh_token_ciphertext=NULL, last_error_code='revoked_by_owner' WHERE id=$1`, id)
	return err
}

func (r *Repository) MarkRefreshed(ctx context.Context, id uuid.UUID) {
	_, _ = r.pool.Exec(ctx, `UPDATE drive_connections SET last_refreshed_at=now() WHERE id=$1`, id)
}

func (r *Repository) SetConsent(ctx context.Context, userID uuid.UUID, version string) error {
	ct, err := r.pool.Exec(ctx, `UPDATE drive_connections
		SET policy_consent_version=$2, policy_consent_at=now(), policy_consent_by_user_id=$1 WHERE user_id=$1`,
		userID, version)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return apperr.BadRequest("Conecte Google Drive antes de aceptar la política institucional.")
	}
	return nil
}

type AdminConnectionRow struct {
	Connection
	UserName     string `json:"user_name"`
	UserStatus   string `json:"user_status"`
	AreaName     string `json:"area_name,omitempty"`
	PositionName string `json:"position_name,omitempty"`
}

func (r *Repository) AdminList(ctx context.Context, status string, page, size int) ([]AdminConnectionRow, int, error) {
	where := " WHERE 1=1"
	args := []any{}
	if status != "" {
		args = append(args, status)
		where += " AND c.status = $1"
	}
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM drive_connections c`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, size, (page-1)*size)
	rows, err := r.pool.Query(ctx, `SELECT `+connectionColumns+`,
		COALESCE(NULLIF(btrim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.display_name, ''),
		u.status, COALESCE(a.name,''), COALESCE(p.name,'')
		FROM drive_connections c
		JOIN users u ON u.id = c.user_id
		LEFT JOIN areas a ON a.id = u.area_id
		LEFT JOIN positions p ON p.id = u.position_id`+where+`
		ORDER BY c.connected_at DESC LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []AdminConnectionRow
	for rows.Next() {
		var c AdminConnectionRow
		if err := rows.Scan(&c.ID, &c.UserID, &c.GoogleSubject, &c.GoogleEmail, &c.RefreshCiphertext,
			&c.Scopes, &c.Status, &c.ConnectedAt, &c.LastRefreshedAt, &c.LastErrorCode,
			&c.PolicyVersion, &c.PolicyConsentAt, &c.PolicyConsentBy,
			&c.UserName, &c.UserStatus, &c.AreaName, &c.PositionName); err != nil {
			return nil, 0, err
		}
		c.HasRefreshToken = len(c.RefreshCiphertext) > 0
		out = append(out, c)
	}
	return out, total, rows.Err()
}

// --- metadatos de nodos de Drive ---

type queryRower interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func (r *Repository) UpsertNode(ctx context.Context, connectionID uuid.UUID, f RemoteFile) (uuid.UUID, error) {
	return r.upsertNode(ctx, r.pool, connectionID, f)
}

func (r *Repository) upsertNode(ctx context.Context, ex queryRower, connectionID uuid.UUID, f RemoteFile) (uuid.UUID, error) {
	var id uuid.UUID
	err := ex.QueryRow(ctx, `INSERT INTO drive_nodes
		(id, drive_connection_id, google_file_id, name, mime_type, size_bytes, created_time, modified_time,
		 md5_checksum, web_view_link, description, starred, shared, can_download, trashed,
		 is_shortcut, shortcut_target_id, shortcut_target_mime_type, source_revision_id, last_seen_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
		ON CONFLICT (drive_connection_id, google_file_id) DO UPDATE SET
			name=EXCLUDED.name, mime_type=EXCLUDED.mime_type, size_bytes=EXCLUDED.size_bytes,
			created_time=EXCLUDED.created_time, modified_time=EXCLUDED.modified_time,
			md5_checksum=EXCLUDED.md5_checksum, web_view_link=EXCLUDED.web_view_link,
			description=EXCLUDED.description, starred=EXCLUDED.starred, shared=EXCLUDED.shared,
			can_download=EXCLUDED.can_download, trashed=EXCLUDED.trashed,
			is_shortcut=EXCLUDED.is_shortcut, shortcut_target_id=EXCLUDED.shortcut_target_id,
			shortcut_target_mime_type=EXCLUDED.shortcut_target_mime_type,
			source_revision_id=EXCLUDED.source_revision_id, last_seen_at=now()
		RETURNING id`,
		uuid.New(), connectionID, f.ID, f.Name, f.MimeType, nullableSize(f.Size),
		nullableTime(f.CreatedTime), nullableTime(f.ModifiedTime), nullableText(f.MD5),
		nullableText(f.WebViewLink), nullableText(f.Description), f.Starred, f.Shared,
		f.CanDownload, f.Trashed, f.IsShortcut, nullableText(f.ShortcutTarget),
		nullableText(f.ShortcutTargetMime), nullableText(f.RevisionID)).Scan(&id)
	return id, err
}

// LinkParent conserva la compatibilidad con llamadas antiguas.
func (r *Repository) LinkParent(ctx context.Context, nodeID uuid.UUID, parentGoogleID string) error {
	return r.SyncNodeParents(ctx, nodeID, []string{parentGoogleID})
}

// SyncNodeParents reemplaza las relaciones padre-hijo actuales del nodo.
func (r *Repository) SyncNodeParents(ctx context.Context, nodeID uuid.UUID, parentIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := syncNodeParents(ctx, tx, nodeID, parentIDs); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func syncNodeParents(ctx context.Context, tx pgx.Tx, nodeID uuid.UUID, parentIDs []string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM drive_node_parents WHERE drive_node_id=$1`, nodeID); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, parent := range parentIDs {
		parent = strings.TrimSpace(parent)
		if parent == "" || seen[parent] {
			continue
		}
		seen[parent] = true
		if _, err := tx.Exec(ctx, `INSERT INTO drive_node_parents (drive_node_id, parent_google_file_id)
			VALUES ($1,$2)`, nodeID, parent); err != nil {
			return err
		}
	}
	return nil
}

// UpsertChildren persiste una página completa de Drive en una sola transacción.
func (r *Repository) UpsertChildren(ctx context.Context, connectionID uuid.UUID, parentID string, files []RemoteFile) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, f := range files {
		nodeID, err := r.upsertNode(ctx, tx, connectionID, f)
		if err != nil {
			return err
		}
		parents := f.Parents
		if len(parents) == 0 && parentID != "" {
			parents = []string{parentID}
		}
		if err := syncNodeParents(ctx, tx, nodeID, parents); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type Node struct {
	ID             uuid.UUID
	GoogleFileID   string
	Name           string
	MimeType       string
	SizeBytes      *int64
	ModifiedTime   *time.Time
	MD5Checksum    string
	CanDownload    bool
	IsShortcut     bool
	ShortcutTarget string
}

func (r *Repository) GetNode(ctx context.Context, connectionID uuid.UUID, googleID string) (*Node, error) {
	var n Node
	err := r.pool.QueryRow(ctx, `SELECT id, google_file_id, name, mime_type, size_bytes, modified_time,
		COALESCE(md5_checksum,''), can_download, is_shortcut, COALESCE(shortcut_target_id,'')
		FROM drive_nodes WHERE drive_connection_id=$1 AND google_file_id=$2`, connectionID, googleID).
		Scan(&n.ID, &n.GoogleFileID, &n.Name, &n.MimeType, &n.SizeBytes, &n.ModifiedTime,
			&n.MD5Checksum, &n.CanDownload, &n.IsShortcut, &n.ShortcutTarget)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Metadatos de Drive no encontrados.")
	}
	return &n, err
}

func (r *Repository) NodeByInternalID(ctx context.Context, id uuid.UUID) (*Node, error) {
	var n Node
	err := r.pool.QueryRow(ctx, `SELECT id, google_file_id, name, mime_type, size_bytes, modified_time,
		COALESCE(md5_checksum,''), can_download, is_shortcut, COALESCE(shortcut_target_id,'')
		FROM drive_nodes WHERE id=$1`, id).
		Scan(&n.ID, &n.GoogleFileID, &n.Name, &n.MimeType, &n.SizeBytes, &n.ModifiedTime,
			&n.MD5Checksum, &n.CanDownload, &n.IsShortcut, &n.ShortcutTarget)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Elemento de Drive no encontrado.")
	}
	return &n, err
}

// --- política institucional ---

func (r *Repository) LatestPolicy(ctx context.Context) (*Policy, error) {
	var p Policy
	err := r.pool.QueryRow(ctx, `SELECT version, content, published_at FROM policy_versions
		ORDER BY published_at DESC LIMIT 1`).
		Scan(&p.Version, &p.Content, &p.PublishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Todavía no se ha publicado una política institucional.")
	}
	return &p, err
}

func (r *Repository) PolicyExists(ctx context.Context, version string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM policy_versions WHERE version=$1)`, version).Scan(&exists)
	return exists, err
}

func (r *Repository) CreatePolicy(ctx context.Context, version, content string, actor uuid.UUID) (*Policy, error) {
	var p Policy
	err := r.pool.QueryRow(ctx, `INSERT INTO policy_versions (id, version, content, created_by_user_id)
		VALUES ($1,$2,$3,$4) RETURNING version, content, published_at`,
		uuid.New(), version, content, actor).Scan(&p.Version, &p.Content, &p.PublishedAt)
	if err != nil {
		if strings.Contains(err.Error(), "policy_versions_version_key") {
			return nil, apperr.Conflict("policy_exists", "Esa versión de política ya existe.")
		}
		return nil, err
	}
	return &p, nil
}

func nullableSize(v int64) *int64 {
	if v <= 0 {
		return nil
	}
	return &v
}

func nullableTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func nullableText(s string) *string {
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
