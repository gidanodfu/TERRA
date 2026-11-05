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
	ID                 string
	Name               string
	MimeType           string
	Parents            []string
	Size               int64
	CreatedTime        time.Time
	ModifiedTime       time.Time
	MD5                string
	WebViewLink        string
	Description        string
	Starred            bool
	Shared             bool
	CanDownload        bool
	Trashed            bool
	IsShortcut         bool
	ShortcutTarget     string
	ShortcutTargetMime string
	RevisionID         string
}

const (
	MimeFolder       = "application/vnd.google-apps.folder"
	MimeShortcut     = "application/vnd.google-apps.shortcut"
	MimeDocument     = "application/vnd.google-apps.document"
	MimeSpreadsheet  = "application/vnd.google-apps.spreadsheet"
	MimePresentation = "application/vnd.google-apps.presentation"
	MimeDrawing      = "application/vnd.google-apps.drawing"
	MimeForm         = "application/vnd.google-apps.form"
	MimeScript       = "application/vnd.google-apps.script"
	MimeVids         = "application/vnd.google-apps.vid"
)

// ExportFormat describe una exportación nativa admitida por Google.
type ExportFormat struct {
	MimeType  string
	Extension string
	Label     string
}

var exportFormats = map[string][]ExportFormat{
	MimeDocument: {
		{"application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx", "DOCX"},
		{"application/pdf", ".pdf", "PDF"},
		{"application/vnd.oasis.opendocument.text", ".odt", "ODT"},
		{"application/rtf", ".rtf", "RTF"},
		{"text/plain", ".txt", "TXT"},
		{"text/html", ".html", "HTML"},
		{"application/zip", ".zip", "ZIP HTML"},
		{"application/epub+zip", ".epub", "EPUB"},
		{"text/markdown", ".md", "Markdown"},
	},
	MimeSpreadsheet: {
		{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx", "XLSX"},
		{"application/pdf", ".pdf", "PDF"},
		{"application/vnd.oasis.opendocument.spreadsheet", ".ods", "ODS"},
		{"text/csv", ".csv", "CSV (primera hoja)"},
		{"text/tab-separated-values", ".tsv", "TSV (primera hoja)"},
		{"application/zip", ".zip", "ZIP HTML"},
	},
	MimePresentation: {
		{"application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx", "PPTX"},
		{"application/pdf", ".pdf", "PDF"},
		{"application/vnd.oasis.opendocument.presentation", ".odp", "ODP"},
		{"text/plain", ".txt", "TXT"},
	},
	MimeDrawing: {
		{"application/pdf", ".pdf", "PDF"},
		{"image/png", ".png", "PNG"},
		{"image/jpeg", ".jpg", "JPEG"},
		{"image/svg+xml", ".svg", "SVG"},
	},
	MimeScript: {
		{"application/vnd.google-apps.script+json", ".json", "JSON"},
	},
	MimeForm: {
		{"application/json", ".form.json", "JSON (definición)"},
	},
}

// ExportFormats devuelve las exportaciones oficiales admitidas para un MIME nativo.
func ExportFormats(source string) []ExportFormat {
	formats := exportFormats[source]
	out := make([]ExportFormat, len(formats))
	copy(out, formats)
	return out
}

// ExportMime asigna el formato de exportación predeterminado y determinista.
func ExportMime(source string) (string, bool) {
	formats := exportFormats[source]
	if len(formats) == 0 {
		return "", false
	}
	return formats[0].MimeType, true
}

// ExportExtension devuelve la extensión de salida para un MIME de exportación.
func ExportExtension(exportMime string) string {
	for _, formats := range exportFormats {
		for _, format := range formats {
			if format.MimeType == exportMime {
				return format.Extension
			}
		}
	}
	return ""
}

// SupportsExport indica si el tipo nativo tiene una estrategia de exportación.
func SupportsExport(source string) bool { return len(exportFormats[source]) > 0 }

func IsNative(mime string) bool {
	switch mime {
	case MimeDocument, MimeSpreadsheet, MimePresentation, MimeDrawing,
		MimeForm, MimeScript, "application/vnd.google-apps.site",
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

// FileRoot es un archivo individual validado contra Google Drive.
type FileRoot struct {
	GoogleID     string    `json:"google_file_id"`
	Name         string    `json:"file_name"`
	SourcePath   string    `json:"source_path"`
	MimeType     string    `json:"mime_type"`
	Size         int64     `json:"size_bytes,omitempty"`
	ModifiedTime time.Time `json:"modified_time"`
	RevisionID   string    `json:"revision_id,omitempty"`
	CanDownload  bool      `json:"can_download"`
}

// Selection agrupa raíces de carpeta y archivo ya normalizadas.
type Selection struct {
	Folders []Root     `json:"folders"`
	Files   []FileRoot `json:"files"`
}

// FileSelectable indica si un archivo puede seleccionarse como raíz descargable.
func FileSelectable(f RemoteFile) bool {
	if f.MimeType == MimeFolder || f.IsShortcut || f.Trashed {
		return false
	}
	if IsNative(f.MimeType) {
		return SupportsExport(f.MimeType)
	}
	return f.CanDownload
}

type FolderItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mime_type"`
}

type BrowsePathItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type BrowseItem struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	MimeType           string     `json:"mime_type"`
	Kind               string     `json:"kind"`
	SizeBytes          *int64     `json:"size_bytes"`
	CreatedTime        *time.Time `json:"created_time"`
	ModifiedTime       *time.Time `json:"modified_time"`
	WebViewLink        string     `json:"web_view_link,omitempty"`
	Description        string     `json:"description,omitempty"`
	Starred            bool       `json:"starred"`
	Shared             bool       `json:"shared"`
	CanDownload        bool       `json:"can_download"`
	Selectable         bool       `json:"selectable"`
	IsShortcut         bool       `json:"is_shortcut"`
	ShortcutTargetID   string     `json:"shortcut_target_id,omitempty"`
	ShortcutTargetMime string     `json:"shortcut_target_mime_type,omitempty"`
}

type Policy struct {
	Version     string    `json:"version"`
	Content     string    `json:"content"`
	PublishedAt time.Time `json:"published_at"`
}
