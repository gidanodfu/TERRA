package drive

import (
	"testing"

	gdrive "google.golang.org/api/drive/v3"
)

func TestToRemotePreservesBrowseMetadata(t *testing.T) {
	file := &gdrive.File{
		Id: "file-1", Name: "Reporte.pdf", MimeType: "application/pdf",
		Parents: []string{"folder-1"}, Size: 2457600,
		CreatedTime: "2026-11-01T10:00:00Z", ModifiedTime: "2026-11-04T10:30:00Z",
		Md5Checksum: "abc", WebViewLink: "https://drive.example/file",
		Description: "Reporte institucional", Starred: true, Shared: true,
		Capabilities: &gdrive.FileCapabilities{CanDownload: true},
		HeadRevisionId: "rev-1",
	}
	remote := toRemote(file)
	if remote.ID != "file-1" || remote.Name != "Reporte.pdf" || remote.MimeType != "application/pdf" {
		t.Fatalf("identidad incorrecta: %+v", remote)
	}
	if remote.Size != 2457600 || remote.CreatedTime.IsZero() || remote.ModifiedTime.IsZero() {
		t.Fatalf("metadatos básicos incorrectos: %+v", remote)
	}
	if remote.WebViewLink == "" || remote.Description == "" || !remote.Starred || !remote.Shared || !remote.CanDownload {
		t.Fatalf("metadatos extendidos incorrectos: %+v", remote)
	}
	if len(remote.Parents) != 1 || remote.Parents[0] != "folder-1" || remote.RevisionID != "rev-1" {
		t.Fatalf("relación o revisión incorrecta: %+v", remote)
	}

	shortcut := toRemote(&gdrive.File{
		Id: "shortcut-1", Name: "Acceso", MimeType: MimeShortcut,
		ShortcutDetails: &gdrive.FileShortcutDetails{TargetId: "target-1", TargetMimeType: MimeFolder},
	})
	if !shortcut.IsShortcut || shortcut.ShortcutTarget != "target-1" || shortcut.ShortcutTargetMime != MimeFolder {
		t.Fatalf("atajo incorrecto: %+v", shortcut)
	}
}
