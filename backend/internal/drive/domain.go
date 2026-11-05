// El paquete drive implementa la integración con la API v3 de Google Drive y la
// autorización OAuth por worker utilizada para acceder a los documentos.
package drive

import (
	"time"

	"github.com/google/uuid"
)

type ConnectionStatus string

const (
	StatusConnected             ConnectionStatus = "connected"
	StatusReauthorizationNeeded ConnectionStatus = "reauthorization_required"
	StatusRevoked               ConnectionStatus = "revoked"
	StatusError                 ConnectionStatus = "error"
)

type Connection struct {
	ID                uuid.UUID        `json:"id"`
	UserID            uuid.UUID        `json:"user_id"`
	GoogleSubject     string           `json:"-"`
	GoogleEmail       string           `json:"google_email,omitempty"`
	RefreshCiphertext []byte           `json:"-"`
	HasRefreshToken   bool             `json:"has_refresh_token"`
	Scopes            string           `json:"scopes"`
	Status            ConnectionStatus `json:"status"`
	ConnectedAt       time.Time        `json:"connected_at"`
	LastRefreshedAt   *time.Time       `json:"last_refreshed_at,omitempty"`
	LastErrorCode     string           `json:"last_error_code,omitempty"`
	PolicyVersion     string           `json:"policy_consent_version,omitempty"`
	PolicyConsentAt   *time.Time       `json:"policy_consent_at,omitempty"`
	PolicyConsentBy   *uuid.UUID       `json:"policy_consent_by_user_id,omitempty"`
}

type RemoteFile struct {
	ID             string
	Name           string
	MimeType       string
	Parents        []string
	Size           int64
	ModifiedTime   time.Time
	MD5            string
	CanDownload    bool
	Trashed        bool
	IsShortcut     bool
	ShortcutTarget string
	RevisionID     string
}

const (
	MimeFolder       = "application/vnd.google-apps.folder"
	MimeShortcut     = "application/vnd.google-apps.shortcut"
	MimeDocument     = "application/vnd.google-apps.document"
	MimeSpreadsheet  = "application/vnd.google-apps.spreadsheet"
	MimePresentation = "application/vnd.google-apps.presentation"
	MimeVids         = "application/vnd.google-apps.vid"
)

// ExportMime asigna los documentos nativos de Google al formato de exportación requerido.
func ExportMime(source string) (string, bool) {
	switch source {
	case MimeDocument:
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true
	case MimeSpreadsheet:
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", true
	case MimePresentation:
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation", true
	default:
		return "", false
	}
}

func IsNative(mime string) bool {
	switch mime {
	case MimeDocument, MimeSpreadsheet, MimePresentation, "application/vnd.google-apps.drawing",
		"application/vnd.google-apps.form", "application/vnd.google-apps.script", "application/vnd.google-apps.site",
		"application/vnd.google-apps.jam", "application/vnd.google-apps.map", MimeVids:
		return true
	}
	return false
}

// Root es una selección de nivel superior validada dentro de Mi unidad.
type Root struct {
	GoogleID   string `json:"google_folder_id"`
	Name       string `json:"folder_name"`
	SourcePath string `json:"source_path"`
}

type FolderItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mime_type"`
}

type Policy struct {
	Version     string    `json:"version"`
	Content     string    `json:"content"`
	PublishedAt time.Time `json:"published_at"`
}
