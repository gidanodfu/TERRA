package drive

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	gdrive "google.golang.org/api/drive/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"

	"terra/internal/platform/apperr"
	"terra/internal/platform/crypto"
	"terra/internal/platform/googleoauth"
)

var driveIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// APIError carries the retry/reauth semantics the worker needs.
type APIError struct {
	Code       string
	Transient  bool
	Reauth     bool
	RetryAfter time.Duration
	Err        error
}

func (e *APIError) Error() string { return e.Code + ": " + e.Err.Error() }
func (e *APIError) Unwrap() error { return e.Err }

var ErrReauthorization = errors.New("drive reauthorization required")

const fileFields = "id,name,mimeType,parents,size,modifiedTime,md5Checksum,capabilities(canDownload),shortcutDetails(targetId,targetMimeType),trashed,headRevisionId"

type Provider struct {
	google *googleoauth.Client
	box    *crypto.Box
}

func NewProvider(google *googleoauth.Client, box *crypto.Box) *Provider {
	return &Provider{google: google, box: box}
}

type API struct {
	svc *gdrive.Service
}

func (p *Provider) NewAPI(ctx context.Context, conn *Connection) (*API, error) {
	if len(conn.RefreshCiphertext) == 0 {
		return nil, ErrReauthorization
	}
	refresh, err := p.box.Open(conn.RefreshCiphertext)
	if err != nil {
		return nil, fmt.Errorf("decrypt refresh token: %w", err)
	}
	ts := p.google.TokenSource(ctx, string(refresh))
	svc, err := gdrive.NewService(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, err
	}
	return &API{svc: svc}, nil
}

func (a *API) RootID(ctx context.Context) (string, error) {
	f, err := a.svc.Files.Get("root").Context(ctx).Fields("id").Do()
	if err != nil {
		return "", classify(err)
	}
	return f.Id, nil
}

func (a *API) GetFile(ctx context.Context, id string) (*RemoteFile, error) {
	if !driveIDPattern.MatchString(id) {
		return nil, &APIError{Code: "invalid_drive_id", Err: errors.New("invalid drive id")}
	}
	f, err := a.svc.Files.Get(id).Context(ctx).Fields(fileFields).Do()
	if err != nil {
		return nil, classify(err)
	}
	return toRemote(f), nil
}

func (a *API) ListChildren(ctx context.Context, folderID string) ([]RemoteFile, error) {
	if !driveIDPattern.MatchString(folderID) {
		return nil, &APIError{Code: "invalid_drive_id", Err: errors.New("invalid drive id")}
	}
	q := fmt.Sprintf("'%s' in parents and trashed = false", folderID)
	var out []RemoteFile
	pageToken := ""
	for {
		call := a.svc.Files.List().Context(ctx).Q(q).PageSize(500).Fields("nextPageToken, files(" + fileFields + ")")
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			return nil, classify(err)
		}
		for _, f := range resp.Files {
			if f.Trashed {
				continue
			}
			out = append(out, *toRemote(f))
		}
		if resp.NextPageToken == "" {
			return out, nil
		}
		pageToken = resp.NextPageToken
	}
}

func (a *API) ListFolders(ctx context.Context, parentID string) ([]FolderItem, error) {
	if !driveIDPattern.MatchString(parentID) {
		return nil, &APIError{Code: "invalid_drive_id", Err: errors.New("invalid drive id")}
	}
	q := fmt.Sprintf("'%s' in parents and mimeType = '%s' and trashed = false", parentID, MimeFolder)
	var out []FolderItem
	pageToken := ""
	for {
		call := a.svc.Files.List().Context(ctx).Q(q).PageSize(200).
			Fields("nextPageToken, files(id,name,mimeType)").OrderBy("name")
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			return nil, classify(err)
		}
		for _, f := range resp.Files {
			out = append(out, FolderItem{ID: f.Id, Name: f.Name, MimeType: f.MimeType})
		}
		if resp.NextPageToken == "" {
			return out, nil
		}
		pageToken = resp.NextPageToken
	}
}

// PathToRoot returns the folder chain from Mi unidad down to id, inclusive.
// It proves the selected folder is inside this connection's My Drive tree.
func (a *API) PathToRoot(ctx context.Context, id string) ([]RemoteFile, error) {
	rootID, err := a.RootID(ctx)
	if err != nil {
		return nil, err
	}
	if id == "root" || id == rootID {
		return []RemoteFile{}, nil
	}
	var chain []RemoteFile
	cur := id
	seen := map[string]bool{}
	for depth := 0; depth < 200; depth++ {
		if seen[cur] {
			return nil, &APIError{Code: "drive_cycle", Err: errors.New("cycle in parent chain")}
		}
		seen[cur] = true
		f, err := a.GetFile(ctx, cur)
		if err != nil {
			return nil, err
		}
		chain = append([]RemoteFile{*f}, chain...)
		if len(f.Parents) == 0 {
			return nil, &APIError{Code: "not_in_my_drive", Err: errors.New("folder is not inside My Drive")}
		}
		parent := f.Parents[0]
		if parent == "root" || parent == rootID {
			return chain, nil
		}
		cur = parent
	}
	return nil, &APIError{Code: "drive_depth_exceeded", Err: errors.New("parent chain too deep")}
}

// OpenDownload streams either a binary file or the required native export.
func (a *API) OpenDownload(ctx context.Context, f RemoteFile) (io.ReadCloser, int64, string, error) {
	if f.MimeType == MimeFolder {
		return nil, 0, "", &APIError{Code: "is_folder", Err: errors.New("folders cannot be downloaded")}
	}
	if f.IsNative() {
		exportMime, ok := ExportMime(f.MimeType)
		if !ok {
			return nil, 0, "", &APIError{Code: "unsupported_google_type", Err: errors.New(f.MimeType)}
		}
		resp, err := a.svc.Files.Export(f.ID, exportMime).Context(ctx).Download()
		if err != nil {
			return nil, 0, "", classify(err)
		}
		return resp.Body, resp.ContentLength, exportMime, nil
	}
	if !f.CanDownload {
		return nil, 0, "", &APIError{Code: "not_downloadable", Err: errors.New("capabilities.canDownload is false")}
	}
	resp, err := a.svc.Files.Get(f.ID).Context(ctx).Download()
	if err != nil {
		return nil, 0, "", classify(err)
	}
	return resp.Body, resp.ContentLength, f.MimeType, nil
}

func (f RemoteFile) IsNative() bool { return IsNative(f.MimeType) }

func toRemote(f *gdrive.File) *RemoteFile {
	r := &RemoteFile{
		ID: f.Id, Name: f.Name, MimeType: f.MimeType, Size: f.Size,
		ModifiedTime: parseTime(f.ModifiedTime), MD5: f.Md5Checksum,
		Trashed: f.Trashed, Parents: f.Parents, RevisionID: f.HeadRevisionId,
	}
	if f.Capabilities != nil {
		r.CanDownload = f.Capabilities.CanDownload
	}
	if f.ShortcutDetails != nil {
		r.IsShortcut = true
		r.ShortcutTarget = f.ShortcutDetails.TargetId
	}
	return r
}

func parseTime(raw string) time.Time {
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}
	}
	return t
}

func classify(err error) error {
	var gerr *googleapi.Error
	if errors.As(err, &gerr) {
		apiErr := &APIError{Err: err, Code: "drive_api_error"}
		switch gerr.Code {
		case http.StatusUnauthorized:
			apiErr.Code = "drive_unauthorized"
			apiErr.Reauth = true
		case http.StatusTooManyRequests:
			apiErr.Code = "drive_rate_limited"
			apiErr.Transient = true
		case http.StatusForbidden:
			reason := ""
			for _, item := range gerr.Errors {
				reason = item.Reason
			}
			if reason == "rateLimitExceeded" || reason == "userRateLimitExceeded" || reason == "quotaExceeded" {
				apiErr.Code = "drive_rate_limited"
				apiErr.Transient = true
			} else if reason == "insufficientFilePermissions" || reason == "cannotDownloadFile" {
				apiErr.Code = "not_downloadable"
			} else {
				apiErr.Code = "drive_forbidden"
			}
		case http.StatusNotFound:
			apiErr.Code = "drive_not_found"
		default:
			if gerr.Code >= 500 {
				apiErr.Transient = true
				apiErr.Code = "drive_unavailable"
			}
		}
		if ra := gerr.Header.Get("Retry-After"); ra != "" {
			if secs, e := time.ParseDuration(ra + "s"); e == nil {
				apiErr.RetryAfter = secs
			}
		}
		return apiErr
	}
	msg := err.Error()
	if strings.Contains(msg, "invalid_grant") || strings.Contains(msg, "token has been expired or revoked") ||
		strings.Contains(msg, "unauthorized_client") {
		return &APIError{Code: "drive_reauthorization_required", Reauth: true, Err: err}
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return &APIError{Code: "cancelled", Err: err}
	}
	return &APIError{Code: "drive_transient", Transient: true, Err: err}
}

// Translate exposes classification to the worker.
func Translate(err error) *APIError {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr
	}
	return &APIError{Code: "drive_error", Err: err}
}

func BadRequest(message string) error { return apperr.BadRequest(message) }
