package downloads

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/platform/apperr"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const jobSelect = `
	SELECT j.id, j.requested_by_user_id,
		COALESCE(NULLIF(btrim(COALESCE(ru.first_name,'') || ' ' || COALESCE(ru.last_name,'')), ''), ru.display_name, ''),
		j.drive_owner_user_id,
		COALESCE(NULLIF(btrim(COALESCE(ou.first_name,'') || ' ' || COALESCE(ou.last_name,'')), ''), ou.display_name, ''),
		j.drive_connection_id, j.area_id_snapshot, j.position_id_snapshot,
		j.area_name_snapshot, j.position_name_snapshot, j.area_slug_snapshot, j.position_slug_snapshot,
		j.scope_type, j.status, j.total_items, j.completed_items, j.skipped_items, j.failed_items,
		j.total_bytes, j.downloaded_bytes, COALESCE(j.error_code,''), COALESCE(j.error_message,''),
		j.created_at, j.started_at, j.finished_at, j.scan_completed_at, j.cancel_requested_at,
		COALESCE(j.worker_lease_owner,''), j.lease_expires_at, j.heartbeat_at, COALESCE(j.idempotency_key,'')
	FROM download_jobs j
	JOIN users ru ON ru.id = j.requested_by_user_id
	JOIN users ou ON ou.id = j.drive_owner_user_id`

func scanJob(row pgx.Row) (*Job, error) {
	var j Job
	err := row.Scan(&j.ID, &j.RequestedByUserID, &j.RequestedByName, &j.DriveOwnerUserID, &j.DriveOwnerName,
		&j.DriveConnectionID, &j.AreaID, &j.PositionID, &j.AreaName, &j.PositionName, &j.AreaSlug, &j.PositionSlug,
		&j.ScopeType, &j.Status, &j.TotalItems, &j.CompletedItems, &j.SkippedItems, &j.FailedItems,
		&j.TotalBytes, &j.DownloadedBytes, &j.ErrorCode, &j.ErrorMessage,
		&j.CreatedAt, &j.StartedAt, &j.FinishedAt, &j.ScanCompletedAt, &j.CancelRequestedAt,
		&j.WorkerLeaseOwner, &j.LeaseExpiresAt, &j.HeartbeatAt, &j.IdempotencyKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Trabajo de descarga no encontrado.")
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (r *Repository) Get(ctx context.Context, id uuid.UUID) (*Job, error) {
	j, err := scanJob(r.pool.QueryRow(ctx, jobSelect+` WHERE j.id=$1`, id))
	if err != nil {
		return nil, err
	}
	j.Roots, err = r.roots(ctx, id)
	if err != nil {
		return nil, err
	}
	j.FileRoots, err = r.fileRoots(ctx, id)
	return j, err
}

func (r *Repository) roots(ctx context.Context, jobID uuid.UUID) ([]Root, error) {
	rows, err := r.pool.Query(ctx, `SELECT google_folder_id, folder_name_snapshot, source_path_snapshot, created_at
		FROM download_job_roots WHERE job_id=$1 ORDER BY source_path_snapshot`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Root{}
	for rows.Next() {
		var root Root
		if err := rows.Scan(&root.GoogleFolderID, &root.FolderName, &root.SourcePath, &root.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, root)
	}
	return out, rows.Err()
}

func (r *Repository) fileRoots(ctx context.Context, jobID uuid.UUID) ([]FileRoot, error) {
	rows, err := r.pool.Query(ctx, `SELECT google_file_id, file_name_snapshot, source_path_snapshot, created_at
		FROM download_job_file_roots WHERE job_id=$1 ORDER BY source_path_snapshot`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FileRoot{}
	for rows.Next() {
		var root FileRoot
		if err := rows.Scan(&root.GoogleFileID, &root.FileName, &root.SourcePath, &root.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, root)
	}
	return out, rows.Err()
}

func (r *Repository) GetByIdempotency(ctx context.Context, requester uuid.UUID, key string) (*Job, error) {
	if key == "" {
		return nil, nil
	}
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `SELECT id FROM download_jobs
		WHERE requested_by_user_id=$1 AND idempotency_key=$2`, requester, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r.Get(ctx, id)
}

// Create inserta un trabajo y sus raíces de forma atómica. Cuando la Idempotency-Key
// ya fue usada por este administrador, devuelve el trabajo existente sin modificarlo.
func (r *Repository) Create(ctx context.Context, j *Job, roots []Root, fileRoots []FileRoot) (*Job, bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var idempotencyKey *string
	if j.IdempotencyKey != "" {
		idempotencyKey = &j.IdempotencyKey
	}
	var id uuid.UUID
	err = tx.QueryRow(ctx, `INSERT INTO download_jobs
		(id, requested_by_user_id, drive_owner_user_id, drive_connection_id,
		 area_id_snapshot, position_id_snapshot, area_name_snapshot, position_name_snapshot,
		 area_slug_snapshot, position_slug_snapshot, scope_type, status, idempotency_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'queued',$12)
		ON CONFLICT (requested_by_user_id, idempotency_key) DO NOTHING
		RETURNING id`,
		j.ID, j.RequestedByUserID, j.DriveOwnerUserID, j.DriveConnectionID,
		j.AreaID, j.PositionID, j.AreaName, j.PositionName, j.AreaSlug, j.PositionSlug,
		j.ScopeType, idempotencyKey).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = tx.Rollback(ctx)
		var existingID uuid.UUID
		if err := r.pool.QueryRow(ctx, `SELECT id FROM download_jobs
			WHERE requested_by_user_id=$1 AND idempotency_key=$2`,
			j.RequestedByUserID, j.IdempotencyKey).Scan(&existingID); err != nil {
			return nil, false, err
		}
		existing, err := r.Get(ctx, existingID)
		return existing, false, err
	}
	if err != nil {
		return nil, false, err
	}
	for _, root := range roots {
		if _, err := tx.Exec(ctx, `INSERT INTO download_job_roots
			(id, job_id, google_folder_id, folder_name_snapshot, source_path_snapshot)
			VALUES ($1,$2,$3,$4,$5)`, uuid.New(), id, root.GoogleFolderID, root.FolderName, root.SourcePath); err != nil {
			return nil, false, err
		}
	}
	for _, root := range fileRoots {
		if _, err := tx.Exec(ctx, `INSERT INTO download_job_file_roots
			(id, job_id, google_file_id, file_name_snapshot, source_path_snapshot)
			VALUES ($1,$2,$3,$4,$5)`, uuid.New(), id, root.GoogleFileID, root.FileName, root.SourcePath); err != nil {
			return nil, false, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, err
	}
	created, err := r.Get(ctx, id)
	return created, true, err
}

type ListFilter struct {
	Status      string
	Scope       string
	AreaID      *uuid.UUID
	PositionID  *uuid.UUID
	OwnerID     *uuid.UUID
	RequesterID *uuid.UUID
	Query       string
	From        *time.Time
	To          *time.Time
	// RestrictToUser limita los resultados a los trabajos que el usuario solicitó o cuyo Drive posee.
	RestrictToUser *uuid.UUID
	Page, Size     int
}

func (r *Repository) List(ctx context.Context, f ListFilter) ([]Job, int, error) {
	where := []string{"1=1"}
	args := []any{}
	add := func(clause string, value any) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(clause, len(args)))
	}
	if f.Status != "" {
		add("j.status = $%d", f.Status)
	}
	if f.Scope != "" {
		add("j.scope_type = $%d", f.Scope)
	}
	if f.AreaID != nil {
		add("j.area_id_snapshot = $%d", *f.AreaID)
	}
	if f.PositionID != nil {
		add("j.position_id_snapshot = $%d", *f.PositionID)
	}
	if f.OwnerID != nil {
		add("j.drive_owner_user_id = $%d", *f.OwnerID)
	}
	if f.RequesterID != nil {
		add("j.requested_by_user_id = $%d", *f.RequesterID)
	}
	if f.Query != "" {
		args = append(args, "%"+f.Query+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(
			"(ou.first_name ILIKE $%d OR ou.last_name ILIKE $%d OR ou.email ILIKE $%d OR ru.first_name ILIKE $%d OR ru.last_name ILIKE $%d)",
			n, n, n, n, n))
	}
	if f.From != nil {
		add("j.created_at >= $%d", *f.From)
	}
	if f.To != nil {
		add("j.created_at <= $%d", *f.To)
	}
	if f.RestrictToUser != nil {
		args = append(args, *f.RestrictToUser)
		n := len(args)
		where = append(where, fmt.Sprintf(
			"(j.drive_owner_user_id = $%d OR j.requested_by_user_id = $%d)", n, n))
	}
	whereSQL := strings.Join(where, " AND ")
	// Duplica el argumento de restricción si la cláusula lo necesita.
	if f.RestrictToUser != nil {
		// La cláusula generada usa el mismo $N dos veces, así que no se necesita un argumento adicional.
	}

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM download_jobs j
		JOIN users ou ON ou.id=j.drive_owner_user_id JOIN users ru ON ru.id=j.requested_by_user_id
		WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, f.Size, (f.Page-1)*f.Size)
	rows, err := r.pool.Query(ctx, jobSelect+` WHERE `+whereSQL+
		` ORDER BY j.created_at DESC LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Job
	for rows.Next() {
		j, err := scanJob(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *j)
	}
	return out, total, rows.Err()
}

func (r *Repository) CountActive(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM download_jobs
		WHERE status IN ('queued','scanning','downloading','waiting_authorization','cancel_requested')`).Scan(&n)
	return n, err
}

func (r *Repository) CountActiveForUser(ctx context.Context, userID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM download_jobs
		WHERE drive_owner_user_id=$1 AND status IN ('queued','scanning','downloading','waiting_authorization','cancel_requested')`,
		userID).Scan(&n)
	return n, err
}

func (r *Repository) UserStorageBytes(ctx context.Context, userID uuid.UUID) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(sum(size_bytes),0) FROM stored_files WHERE drive_owner_user_id=$1`, userID).Scan(&n)
	return n, err
}

func (r *Repository) AreaStorageBytes(ctx context.Context, areaID uuid.UUID) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(sum(sf.size_bytes),0) FROM stored_files sf
		JOIN users u ON u.id = sf.drive_owner_user_id WHERE u.area_id=$1`, areaID).Scan(&n)
	return n, err
}

func (r *Repository) JobBytes(ctx context.Context, jobID uuid.UUID) (int64, error) {
	var n int64
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(sum(size_bytes),0) FROM download_items WHERE job_id=$1`, jobID).Scan(&n)
	return n, err
}

// --- protocolo de cola del worker ---

func (r *Repository) ClaimNext(ctx context.Context, workerID string, lease time.Duration) (*Job, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `WITH candidate AS (
			SELECT j.id FROM download_jobs j
			LEFT JOIN drive_connections c ON c.id = j.drive_connection_id
			WHERE (
				j.status = 'queued'
				OR (j.status IN ('scanning','downloading','cancel_requested')
					AND (j.lease_expires_at IS NULL OR j.lease_expires_at < now()))
				OR (j.status = 'waiting_authorization'
					AND c.status = 'connected' AND c.refresh_token_ciphertext IS NOT NULL
					AND c.policy_consent_version = (SELECT version FROM policy_versions ORDER BY published_at DESC LIMIT 1))
			)
			ORDER BY j.created_at
			FOR UPDATE OF j SKIP LOCKED
			LIMIT 1
		)
		UPDATE download_jobs j SET
			status = CASE
				WHEN j.status IN ('queued','waiting_authorization')
					THEN CASE WHEN j.scan_completed_at IS NULL THEN 'scanning' ELSE 'downloading' END
				ELSE j.status END,
			worker_lease_owner = $1,
			lease_expires_at = now() + make_interval(secs => $2),
			heartbeat_at = now(),
			started_at = COALESCE(j.started_at, now())
		FROM candidate
		WHERE j.id = candidate.id
		RETURNING j.id`, workerID, lease.Seconds()).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r.Get(ctx, id)
}

// Heartbeat extiende el lease e informa si se solicitó la cancelación.
func (r *Repository) Heartbeat(ctx context.Context, jobID uuid.UUID, workerID string, lease time.Duration) (string, bool, error) {
	var status string
	var cancel bool
	err := r.pool.QueryRow(ctx, `UPDATE download_jobs SET
			heartbeat_at = now(), lease_expires_at = now() + make_interval(secs => $3)
		WHERE id=$1 AND worker_lease_owner=$2 AND status IN ('scanning','downloading','cancel_requested')
		RETURNING status, (cancel_requested_at IS NOT NULL OR status='cancel_requested')`,
		jobID, workerID, lease.Seconds()).Scan(&status, &cancel)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, errors.New("lease lost")
	}
	return status, cancel, err
}

func (r *Repository) ReleaseWaiting(ctx context.Context, jobID uuid.UUID, workerID, code, message string) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_jobs SET status='waiting_authorization',
		error_code=$3, error_message=$4, worker_lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=now()
		WHERE id=$1 AND worker_lease_owner=$2`, jobID, workerID, code, message)
	return err
}

func (r *Repository) Finish(ctx context.Context, jobID uuid.UUID, workerID, status, code, message string) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_jobs SET status=$3, finished_at=now(),
		error_code=NULLIF($4,''), error_message=NULLIF($5,''),
		worker_lease_owner=NULL, lease_expires_at=NULL
		WHERE id=$1 AND worker_lease_owner=$2`, jobID, workerID, status, code, message)
	return err
}

func (r *Repository) SetStatus(ctx context.Context, jobID uuid.UUID, status string) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_jobs SET status=$2 WHERE id=$1`, jobID, status)
	return err
}

func (r *Repository) MarkScanCompleted(ctx context.Context, jobID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_jobs SET scan_completed_at=now(), status='downloading'
		WHERE id=$1 AND status IN ('scanning','downloading')`, jobID)
	return err
}

func (r *Repository) RequestCancel(ctx context.Context, jobID uuid.UUID) (*Job, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM download_jobs WHERE id=$1 FOR UPDATE`, jobID).Scan(&status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Trabajo de descarga no encontrado.")
		}
		return nil, err
	}
	if IsTerminal(status) {
		return nil, apperr.Conflict("job_terminal", "El trabajo ya finalizó.")
	}
	if status == "queued" || status == "waiting_authorization" {
		if _, err := tx.Exec(ctx, `UPDATE download_jobs SET status='cancelled', cancel_requested_at=now(),
			finished_at=now(), worker_lease_owner=NULL, lease_expires_at=NULL WHERE id=$1`, jobID); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `UPDATE download_items SET status='cancelled', finished_at=now()
			WHERE job_id=$1 AND status IN ('pending','retrying')`, jobID); err != nil {
			return nil, err
		}
	} else {
		if _, err := tx.Exec(ctx, `UPDATE download_jobs SET status='cancel_requested',
			cancel_requested_at=now() WHERE id=$1`, jobID); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.Get(ctx, jobID)
}

func (r *Repository) RetryFailed(ctx context.Context, jobID uuid.UUID) (*Job, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM download_jobs WHERE id=$1 FOR UPDATE`, jobID).Scan(&status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.NotFound("Trabajo de descarga no encontrado.")
		}
		return nil, err
	}
	if status != JobFailed && status != JobPartiallyCompleted {
		return nil, apperr.Conflict("retry_not_allowed", "Solo se pueden reintentar trabajos fallidos o parciales.")
	}
	ct, err := tx.Exec(ctx, `UPDATE download_items SET status='pending', attempt_count=0,
		next_retry_at=NULL, error_code=NULL, error_message=NULL, started_at=NULL, finished_at=NULL
		WHERE job_id=$1 AND status='failed'`, jobID)
	if err != nil {
		return nil, err
	}
	if ct.RowsAffected() == 0 {
		return nil, apperr.Conflict("no_failed_items", "El trabajo no tiene elementos fallidos.")
	}
	if _, err := tx.Exec(ctx, `UPDATE download_jobs SET status='queued', finished_at=NULL,
		error_code=NULL, error_message=NULL, cancel_requested_at=NULL WHERE id=$1`, jobID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.Get(ctx, jobID)
}

// --- elementos ---

type WorkerItem struct {
	ID           uuid.UUID
	DriveNodeID  uuid.UUID
	GoogleFileID string
	Name         string
	MimeType     string
	RelativePath string
	SizeBytes    *int64
	MD5          string
	CanDownload  bool
	IsShortcut   bool
	ModifiedTime *time.Time
	RevisionID   string
	AttemptCount int
}

func (r *Repository) PendingItems(ctx context.Context, jobID uuid.UUID, limit int) ([]WorkerItem, error) {
	rows, err := r.pool.Query(ctx, `SELECT i.id, i.drive_node_id, n.google_file_id, n.name, n.mime_type,
		i.relative_path, i.size_bytes, COALESCE(n.md5_checksum,''), n.can_download, n.is_shortcut,
		n.modified_time, COALESCE(n.source_revision_id,''), i.attempt_count
		FROM download_items i JOIN drive_nodes n ON n.id = i.drive_node_id
		WHERE i.job_id=$1 AND i.status IN ('pending','retrying')
		  AND (i.next_retry_at IS NULL OR i.next_retry_at <= now())
		ORDER BY i.relative_path LIMIT $2`, jobID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WorkerItem
	for rows.Next() {
		var it WorkerItem
		if err := rows.Scan(&it.ID, &it.DriveNodeID, &it.GoogleFileID, &it.Name, &it.MimeType,
			&it.RelativePath, &it.SizeBytes, &it.MD5, &it.CanDownload, &it.IsShortcut,
			&it.ModifiedTime, &it.RevisionID, &it.AttemptCount); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (r *Repository) MarkDownloading(ctx context.Context, itemID uuid.UUID) (bool, error) {
	ct, err := r.pool.Exec(ctx, `UPDATE download_items SET status='downloading', started_at=now()
		WHERE id=$1 AND status IN ('pending','retrying')`, itemID)
	return ct.RowsAffected() > 0, err
}

func (r *Repository) MarkCompleted(ctx context.Context, jobID, ownerID, itemID, nodeID uuid.UUID,
	relativePath string, size int64, sha, exportMime, revisionID string, modified *time.Time) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `UPDATE download_items SET status='completed', size_bytes=$2, sha256=$3,
		error_code=NULL, error_message=NULL, finished_at=now() WHERE id=$1`, itemID, size, sha); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO stored_files
		(id, drive_owner_user_id, drive_node_id, job_id, relative_path, source_modified_time,
		 source_revision_id, export_mime_type, size_bytes, sha256, status, verified_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',now())
		ON CONFLICT (relative_path) DO UPDATE SET size_bytes=EXCLUDED.size_bytes, sha256=EXCLUDED.sha256,
			export_mime_type=EXCLUDED.export_mime_type, verified_at=now()`,
		uuid.New(), ownerID, nodeID, jobID, relativePath, modified, nullable(revisionID),
		nullable(exportMime), size, sha); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) MarkSkipped(ctx context.Context, itemID uuid.UUID, code, message string) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_items SET status='skipped', error_code=$2,
		error_message=$3, finished_at=now() WHERE id=$1`, itemID, code, message)
	return err
}

func (r *Repository) MarkFailed(ctx context.Context, itemID uuid.UUID, code, message string) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_items SET status='failed', error_code=$2,
		error_message=$3, finished_at=now() WHERE id=$1`, itemID, code, message)
	return err
}

func (r *Repository) MarkRetry(ctx context.Context, itemID uuid.UUID, code, message string, at time.Time) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_items SET status='retrying', attempt_count=attempt_count+1,
		next_retry_at=$2, error_code=$3, error_message=$4 WHERE id=$1`, itemID, at, code, message)
	return err
}

func (r *Repository) MarkItemCancelled(ctx context.Context, itemID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_items SET status='cancelled', finished_at=now() WHERE id=$1`, itemID)
	return err
}

func (r *Repository) CancelPending(ctx context.Context, jobID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_items SET status='cancelled', finished_at=now()
		WHERE job_id=$1 AND status IN ('pending','retrying')`, jobID)
	return err
}

func (r *Repository) FailRemaining(ctx context.Context, jobID uuid.UUID, code, message string) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_items SET status='failed', error_code=$2, error_message=$3,
		finished_at=now() WHERE job_id=$1 AND status IN ('pending','retrying')`, jobID, code, message)
	return err
}

// RecomputeCounters mantiene los contadores de PostgreSQL como autoritativos después de cada elemento.
func (r *Repository) RecomputeCounters(ctx context.Context, jobID uuid.UUID) (*Job, error) {
	_, err := r.pool.Exec(ctx, `UPDATE download_jobs j SET
		total_items = c.total,
		completed_items = c.completed,
		skipped_items = c.skipped,
		failed_items = c.failed,
		total_bytes = c.total_bytes,
		downloaded_bytes = c.downloaded_bytes
		FROM (
			SELECT count(*) AS total,
				count(*) FILTER (WHERE status='completed') AS completed,
				count(*) FILTER (WHERE status='skipped') AS skipped,
				count(*) FILTER (WHERE status='failed') AS failed,
				COALESCE(sum(size_bytes) FILTER (WHERE status <> 'skipped'),0) AS total_bytes,
				COALESCE(sum(size_bytes) FILTER (WHERE status='completed'),0) AS downloaded_bytes
			FROM download_items WHERE job_id=$1
		) c WHERE j.id=$1`, jobID)
	if err != nil {
		return nil, err
	}
	return r.Get(ctx, jobID)
}

func (r *Repository) RemainingCounts(ctx context.Context, jobID uuid.UUID) (pending, completed, skipped, failed int, err error) {
	err = r.pool.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE status IN ('pending','retrying','downloading')),
		count(*) FILTER (WHERE status='completed'),
		count(*) FILTER (WHERE status='skipped'),
		count(*) FILTER (WHERE status='failed')
		FROM download_items WHERE job_id=$1`, jobID).Scan(&pending, &completed, &skipped, &failed)
	return
}

type ItemFilter struct {
	Status string
	Page   int
	Size   int
}

func (r *Repository) ListItems(ctx context.Context, jobID uuid.UUID, f ItemFilter) ([]Item, int, error) {
	where := " WHERE i.job_id=$1"
	args := []any{jobID}
	if f.Status != "" {
		args = append(args, f.Status)
		where += " AND i.status=$2"
	}
	var total int
	if err := r.pool.QueryRow(ctx, "SELECT count(*) FROM download_items i"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, f.Size, (f.Page-1)*f.Size)
	rows, err := r.pool.Query(ctx, `SELECT i.id, i.job_id, i.drive_node_id, n.google_file_id, n.name, n.mime_type,
		i.status, i.attempt_count, i.relative_path, i.size_bytes, COALESCE(i.sha256,''),
		COALESCE(i.error_code,''), COALESCE(i.error_message,''), i.next_retry_at, i.started_at, i.finished_at
		FROM download_items i JOIN drive_nodes n ON n.id=i.drive_node_id`+where+`
		ORDER BY i.relative_path LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.JobID, &it.DriveNodeID, &it.GoogleFileID, &it.Name, &it.MimeType,
			&it.Status, &it.AttemptCount, &it.RelativePath, &it.SizeBytes, &it.SHA256,
			&it.ErrorCode, &it.ErrorMessage, &it.NextRetryAt, &it.StartedAt, &it.FinishedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, it)
	}
	return out, total, rows.Err()
}

func (r *Repository) ItemByID(ctx context.Context, id uuid.UUID) (*Item, error) {
	var it Item
	err := r.pool.QueryRow(ctx, `SELECT i.id, i.job_id, i.drive_node_id, n.google_file_id, n.name, n.mime_type,
		i.status, i.attempt_count, i.relative_path, i.size_bytes, COALESCE(i.sha256,''),
		COALESCE(i.error_code,''), COALESCE(i.error_message,''), i.next_retry_at, i.started_at, i.finished_at
		FROM download_items i JOIN drive_nodes n ON n.id=i.drive_node_id WHERE i.id=$1`, id).
		Scan(&it.ID, &it.JobID, &it.DriveNodeID, &it.GoogleFileID, &it.Name, &it.MimeType,
			&it.Status, &it.AttemptCount, &it.RelativePath, &it.SizeBytes, &it.SHA256,
			&it.ErrorCode, &it.ErrorMessage, &it.NextRetryAt, &it.StartedAt, &it.FinishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Elemento de descarga no encontrado.")
	}
	return &it, err
}

// --- eventos ---

func (r *Repository) AddEvent(ctx context.Context, jobID uuid.UUID, eventType string, payload map[string]any) {
	raw, _ := json.Marshal(payload)
	_, _ = r.pool.Exec(ctx, `INSERT INTO job_events (job_id, event_type, payload) VALUES ($1,$2,$3)`,
		jobID, eventType, raw)
}

func (r *Repository) EventsAfter(ctx context.Context, jobID uuid.UUID, afterID int64, limit int) ([]JobEvent, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, event_type, payload, created_at FROM job_events
		WHERE job_id=$1 AND id > $2 ORDER BY id LIMIT $3`, jobID, afterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []JobEvent
	for rows.Next() {
		var e JobEvent
		var raw []byte
		if err := rows.Scan(&e.ID, &e.Type, &raw, &e.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(raw, &e.Payload)
		out = append(out, e)
	}
	return out, rows.Err()
}

// --- archivos almacenados ---

func (r *Repository) ListStoredFiles(ctx context.Context, ownerID *uuid.UUID, page, size int) ([]StoredFile, int, error) {
	where := ""
	args := []any{}
	if ownerID != nil {
		args = append(args, *ownerID)
		where = " WHERE sf.drive_owner_user_id=$1"
	}
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT count(*) FROM stored_files sf`+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, size, (page-1)*size)
	rows, err := r.pool.Query(ctx, `SELECT sf.id, sf.job_id, sf.drive_owner_user_id, n.name, sf.relative_path,
		sf.size_bytes, sf.sha256, COALESCE(sf.export_mime_type,''), sf.created_at,
		COALESCE(NULLIF(btrim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.display_name, ''),
		COALESCE(a.name,''), COALESCE(p.name,'')
		FROM stored_files sf JOIN drive_nodes n ON n.id=sf.drive_node_id
		JOIN users u ON u.id=sf.drive_owner_user_id
		LEFT JOIN areas a ON a.id=u.area_id
		LEFT JOIN positions p ON p.id=u.position_id`+where+`
		ORDER BY sf.relative_path LIMIT $`+itoa(len(args)-1)+` OFFSET $`+itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []StoredFile
	for rows.Next() {
		var f StoredFile
		if err := rows.Scan(&f.ID, &f.JobID, &f.OwnerUserID, &f.Name, &f.RelativePath,
			&f.SizeBytes, &f.SHA256, &f.ExportMIME, &f.CreatedAt,
			&f.OwnerName, &f.AreaName, &f.PositionName); err != nil {
			return nil, 0, err
		}
		out = append(out, f)
	}
	return out, total, rows.Err()
}

func (r *Repository) GetStoredFile(ctx context.Context, id uuid.UUID) (*StoredFile, error) {
	var f StoredFile
	err := r.pool.QueryRow(ctx, `SELECT sf.id, sf.job_id, sf.drive_owner_user_id, n.name, sf.relative_path,
		sf.size_bytes, sf.sha256, COALESCE(sf.export_mime_type,''), sf.created_at
		FROM stored_files sf JOIN drive_nodes n ON n.id=sf.drive_node_id WHERE sf.id=$1`, id).
		Scan(&f.ID, &f.JobID, &f.OwnerUserID, &f.Name, &f.RelativePath, &f.SizeBytes, &f.SHA256,
			&f.ExportMIME, &f.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Documento no encontrado.")
	}
	return &f, err
}

func (r *Repository) StoredFilesByJob(ctx context.Context, jobID uuid.UUID) ([]StoredFile, error) {
	rows, err := r.pool.Query(ctx, `SELECT sf.id, sf.job_id, sf.drive_owner_user_id, n.name, sf.relative_path,
		sf.size_bytes, sf.sha256, COALESCE(sf.export_mime_type,''), sf.created_at
		FROM stored_files sf JOIN drive_nodes n ON n.id=sf.drive_node_id
		WHERE sf.job_id=$1 ORDER BY sf.relative_path`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []StoredFile
	for rows.Next() {
		var f StoredFile
		if err := rows.Scan(&f.ID, &f.JobID, &f.OwnerUserID, &f.Name, &f.RelativePath,
			&f.SizeBytes, &f.SHA256, &f.ExportMIME, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func nullable(s string) *string {
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

func (r *Repository) CreateItem(ctx context.Context, jobID, nodeID uuid.UUID, relativePath, status string,
	size *int64, code, message string) (bool, error) {
	ct, err := r.pool.Exec(ctx, `INSERT INTO download_items
		(id, job_id, drive_node_id, status, relative_path, size_bytes, error_code, error_message)
		VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),NULLIF($8,''))
		ON CONFLICT (job_id, drive_node_id) DO NOTHING`,
		uuid.New(), jobID, nodeID, status, relativePath, size, code, message)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() > 0, nil
}

func (r *Repository) ResetToPending(ctx context.Context, itemID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE download_items SET status='pending' WHERE id=$1 AND status='downloading'`, itemID)
	return err
}

func (r *Repository) RetryingCount(ctx context.Context, jobID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM download_items WHERE job_id=$1 AND status='retrying'`, jobID).Scan(&n)
	return n, err
}
