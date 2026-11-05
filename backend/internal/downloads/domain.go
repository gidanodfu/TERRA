// El paquete downloads es dueño de la cola persistente en PostgreSQL, el ciclo de vida de los
// trabajos, el protocolo de lease del worker, el progreso SSE y el pipeline de descarga.
package downloads

import (
	"time"

	"github.com/google/uuid"
)

const (
	ScopeMyDriveFull     = "my_drive_full"
	ScopeSelectedFolders = "selected_folders"
)

const (
	JobQueued               = "queued"
	JobScanning             = "scanning"
	JobDownloading          = "downloading"
	JobCompleted            = "completed"
	JobPartiallyCompleted   = "partially_completed"
	JobFailed               = "failed"
	JobWaitingAuthorization = "waiting_authorization"
	JobCancelRequested      = "cancel_requested"
	JobCancelled            = "cancelled"
)

const (
	ItemPending     = "pending"
	ItemDownloading = "downloading"
	ItemCompleted   = "completed"
	ItemSkipped     = "skipped"
	ItemRetrying    = "retrying"
	ItemFailed      = "failed"
	ItemCancelled   = "cancelled"
)

func IsTerminal(status string) bool {
	switch status {
	case JobCompleted, JobPartiallyCompleted, JobFailed, JobCancelled:
		return true
	}
	return false
}

type Job struct {
	ID                uuid.UUID  `json:"id"`
	RequestedByUserID uuid.UUID  `json:"requested_by_user_id"`
	RequestedByName   string     `json:"requested_by_name"`
	DriveOwnerUserID  uuid.UUID  `json:"drive_owner_user_id"`
	DriveOwnerName    string     `json:"drive_owner_name"`
	DriveConnectionID uuid.UUID  `json:"-"`
	AreaID            uuid.UUID  `json:"area_id"`
	PositionID        uuid.UUID  `json:"position_id"`
	AreaName          string     `json:"area_name"`
	PositionName      string     `json:"position_name"`
	AreaSlug          string     `json:"-"`
	PositionSlug      string     `json:"-"`
	ScopeType         string     `json:"scope_type"`
	Status            string     `json:"status"`
	TotalItems        int        `json:"total_items"`
	CompletedItems    int        `json:"completed_items"`
	SkippedItems      int        `json:"skipped_items"`
	FailedItems       int        `json:"failed_items"`
	TotalBytes        int64      `json:"total_bytes"`
	DownloadedBytes   int64      `json:"downloaded_bytes"`
	ErrorCode         string     `json:"error_code,omitempty"`
	ErrorMessage      string     `json:"error_message,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	StartedAt         *time.Time `json:"started_at,omitempty"`
	FinishedAt        *time.Time `json:"finished_at,omitempty"`
	ScanCompletedAt   *time.Time `json:"scan_completed_at,omitempty"`
	CancelRequestedAt *time.Time `json:"cancel_requested_at,omitempty"`
	WorkerLeaseOwner  string     `json:"-"`
	LeaseExpiresAt    *time.Time `json:"-"`
	HeartbeatAt       *time.Time `json:"-"`
	IdempotencyKey    string     `json:"-"`
	Roots             []Root     `json:"roots,omitempty"`
}

type Root struct {
	GoogleFolderID string    `json:"google_folder_id"`
	FolderName     string    `json:"folder_name"`
	SourcePath     string    `json:"source_path"`
	CreatedAt      time.Time `json:"created_at"`
}

type Item struct {
	ID           uuid.UUID  `json:"id"`
	JobID        uuid.UUID  `json:"job_id"`
	DriveNodeID  uuid.UUID  `json:"drive_node_id"`
	GoogleFileID string     `json:"google_file_id"`
	Name         string     `json:"name"`
	MimeType     string     `json:"mime_type"`
	Status       string     `json:"status"`
	AttemptCount int        `json:"attempt_count"`
	RelativePath string     `json:"-"`
	SizeBytes    *int64     `json:"size_bytes,omitempty"`
	SHA256       string     `json:"sha256,omitempty"`
	ErrorCode    string     `json:"error_code,omitempty"`
	ErrorMessage string     `json:"error_message,omitempty"`
	NextRetryAt  *time.Time `json:"next_retry_at,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	FinishedAt   *time.Time `json:"finished_at,omitempty"`
}

type JobEvent struct {
	ID        int64          `json:"id"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload"`
	CreatedAt time.Time      `json:"created_at"`
}

type StoredFile struct {
	ID           uuid.UUID `json:"id"`
	JobID        uuid.UUID `json:"job_id"`
	OwnerUserID  uuid.UUID `json:"drive_owner_user_id"`
	Name         string    `json:"name"`
	RelativePath string    `json:"-"`
	SizeBytes    int64     `json:"size_bytes"`
	SHA256       string    `json:"sha256"`
	ExportMIME   string    `json:"export_mime_type,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	OwnerName    string    `json:"owner_name,omitempty"`
	AreaName     string    `json:"area_name,omitempty"`
	PositionName string    `json:"position_name,omitempty"`
}
