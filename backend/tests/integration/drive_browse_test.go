//go:build integration

package integration_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/audit"
	drivepkg "terra/internal/drive"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/users"
	"terra/tests/helpers"
)

type fakeDriveAPI struct {
	root     string
	paths    map[string][]drivepkg.RemoteFile
	children map[string][]drivepkg.RemoteFile
	next     map[string]string
	listErr  error
	calls    []string
}

func (f *fakeDriveAPI) RootID(context.Context) (string, error) { return f.root, nil }

func (f *fakeDriveAPI) GetFile(_ context.Context, id string) (*drivepkg.RemoteFile, error) {
	path := f.paths[id]
	if len(path) == 0 {
		return nil, &drivepkg.APIError{Code: "drive_not_found", Err: errors.New("not found")}
	}
	file := path[len(path)-1]
	return &file, nil
}

func (f *fakeDriveAPI) PathToRoot(_ context.Context, id string) ([]drivepkg.RemoteFile, error) {
	path := f.paths[id]
	if len(path) == 0 {
		return nil, &drivepkg.APIError{Code: "drive_not_found", Err: errors.New("not found")}
	}
	return path, nil
}

func (f *fakeDriveAPI) ListChildrenPage(_ context.Context, folderID, pageToken string, _ int64) ([]drivepkg.RemoteFile, string, error) {
	f.calls = append(f.calls, folderID+":"+pageToken)
	if f.listErr != nil {
		return nil, "", f.listErr
	}
	if pageToken == "invalid" {
		return nil, "", &drivepkg.APIError{Code: "drive_invalid_request", Err: errors.New("invalid page token")}
	}
	key := folderID
	if pageToken != "" {
		key = folderID + ":" + pageToken
	}
	return f.children[key], f.next[key], nil
}

func (f *fakeDriveAPI) ListFolders(context.Context, string) ([]drivepkg.FolderItem, error) {
	return nil, nil
}

type browseFixture struct {
	pool     *pgxpool.Pool
	service  *drivepkg.Service
	api      *fakeDriveAPI
	userID   uuid.UUID
	connID   uuid.UUID
	policy   string
	children []drivepkg.RemoteFile
}

func newBrowseFixture(t *testing.T) *browseFixture {
	t.Helper()
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Drive", "Cargo Drive")
	userID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	policy := "2026-11"
	helpers.SeedPolicy(t, pool, policy)
	connID := helpers.SeedConnection(t, pool, userID, policy)
	if _, err := pool.Exec(context.Background(), `UPDATE drive_connections
		SET refresh_token_ciphertext=$2, status='connected' WHERE id=$1`, connID, []byte("opaque-refresh")); err != nil {
		t.Fatalf("preparar conexión: %v", err)
	}
	api := &fakeDriveAPI{
		root: "root-id",
		paths: map[string][]drivepkg.RemoteFile{
			"folder-1": {{ID: "folder-1", Name: "Documentos", MimeType: drivepkg.MimeFolder, Parents: []string{"root-id"}}},
		},
		children: map[string][]drivepkg.RemoteFile{},
		next:     map[string]string{},
	}
	cfg := config.Config{Env: "development", PublicURL: "http://localhost:8080",
		SessionCookie: "terra_session", SessionTTL: time.Hour, SessionSecret: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
	service := drivepkg.NewService(cfg, drivepkg.NewRepository(pool), users.NewRepository(pool),
		nil, nil, nil, nil, audit.NewRepository(pool))
	service.SetRemoteAPI(func(context.Context, *drivepkg.Connection) (drivepkg.RemoteAPI, error) {
		return api, nil
	})
	return &browseFixture{pool: pool, service: service, api: api, userID: userID, connID: connID, policy: policy}
}

func (f *browseFixture) requireStatus(t *testing.T, err error, status int, code string) {
	t.Helper()
	var appErr *apperr.Error
	if !errors.As(err, &appErr) {
		t.Fatalf("error no tipado: %v", err)
	}
	if appErr.Status != status || (code != "" && appErr.Code != code) {
		t.Fatalf("status=%d code=%s, se esperaba %d %s: %s", appErr.Status, appErr.Code, status, code, appErr.Message)
	}
}

func TestBrowseReturnsFilesFoldersAndMetadata(t *testing.T) {
	f := newBrowseFixture(t)
	created := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	modified := time.Date(2026, 11, 4, 10, 30, 0, 0, time.UTC)
	pdf := drivepkg.RemoteFile{
		ID: "pdf-1", Name: "Reporte.pdf", MimeType: "application/pdf", Parents: []string{"folder-1"},
		Size: 2457600, CreatedTime: created, ModifiedTime: modified, WebViewLink: "https://drive.example/pdf-1",
		Description: "Reporte institucional", Starred: true, Shared: true, CanDownload: true,
	}
	sheet := drivepkg.RemoteFile{
		ID: "sheet-1", Name: "Resumen", MimeType: drivepkg.MimeSpreadsheet, Parents: []string{"folder-1"},
		ModifiedTime: modified,
	}
	shortcut := drivepkg.RemoteFile{
		ID: "shortcut-1", Name: "Acceso directo", MimeType: drivepkg.MimeShortcut, Parents: []string{"folder-1"},
		IsShortcut: true, ShortcutTarget: "target-1", ShortcutTargetMime: drivepkg.MimeFolder,
	}
	folder := drivepkg.RemoteFile{
		ID: "folder-2", Name: "Informes", MimeType: drivepkg.MimeFolder, Parents: []string{"folder-1"},
		ModifiedTime: modified,
	}
	f.api.children["folder-1"] = []drivepkg.RemoteFile{folder, pdf, sheet, shortcut}

	result, err := f.service.Browse(context.Background(), f.userID, "folder-1", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	if result.Parent.ID != "folder-1" || result.Parent.Name != "Documentos" || result.IsRoot {
		t.Fatalf("parent incorrecto: %+v", result.Parent)
	}
	if len(result.Path) != 2 || result.Path[0].Name != "Mi unidad" || result.Path[1].Name != "Documentos" {
		t.Fatalf("ruta incorrecta: %+v", result.Path)
	}
	if len(result.Items) != 4 {
		t.Fatalf("items=%d", len(result.Items))
	}
	byID := map[string]drivepkg.BrowseItem{}
	for _, item := range result.Items {
		byID[item.ID] = item
	}
	if byID["folder-2"].Kind != "folder" || byID["shortcut-1"].Kind != "shortcut" {
		t.Fatalf("tipos incorrectos: %+v", byID)
	}
	gotPDF := byID["pdf-1"]
	if gotPDF.Name != "Reporte.pdf" || gotPDF.MimeType != "application/pdf" ||
		gotPDF.SizeBytes == nil || *gotPDF.SizeBytes != 2457600 ||
		gotPDF.CreatedTime == nil || gotPDF.ModifiedTime == nil || !gotPDF.CanDownload ||
		gotPDF.WebViewLink == "" || gotPDF.Description == "" || !gotPDF.Starred || !gotPDF.Shared {
		t.Fatalf("metadatos del PDF incorrectos: %+v", gotPDF)
	}
	if byID["sheet-1"].SizeBytes != nil {
		t.Fatalf("el tamaño ausente se inventó: %+v", byID["sheet-1"])
	}
	if !byID["shortcut-1"].IsShortcut || byID["shortcut-1"].ShortcutTargetMime != drivepkg.MimeFolder {
		t.Fatalf("atajo incorrecto: %+v", byID["shortcut-1"])
	}

	var name, webView, description string
	var size *int64
	var starred, shared bool
	if err := f.pool.QueryRow(context.Background(), `SELECT name, size_bytes, web_view_link, description, starred, shared
		FROM drive_nodes WHERE drive_connection_id=$1 AND google_file_id='pdf-1'`, f.connID).
		Scan(&name, &size, &webView, &description, &starred, &shared); err != nil {
		t.Fatal(err)
	}
	if name != "Reporte.pdf" || size == nil || *size != 2457600 || webView == "" || description == "" || !starred || !shared {
		t.Fatalf("persistencia del PDF incorrecta: %s %v %s %s %v %v", name, size, webView, description, starred, shared)
	}
	var parent string
	if err := f.pool.QueryRow(context.Background(), `SELECT p.parent_google_file_id
		FROM drive_node_parents p JOIN drive_nodes n ON n.id=p.drive_node_id
		WHERE n.drive_connection_id=$1 AND n.google_file_id='pdf-1'`, f.connID).Scan(&parent); err != nil {
		t.Fatal(err)
	}
	if parent != "folder-1" {
		t.Fatalf("padre persistido=%s", parent)
	}
	if len(f.api.calls) != 1 {
		t.Fatalf("el explorador recorrió atajos o carpetas adicionales: %v", f.api.calls)
	}

	// Segunda observación: nombre/tamaño nuevos y elemento movido de carpeta.
	pdf.Name = "Reporte actualizado.pdf"
	pdf.Size = 3000000
	pdf.Parents = []string{"folder-3"}
	f.api.children["folder-1"] = []drivepkg.RemoteFile{pdf}
	if _, err := f.service.Browse(context.Background(), f.userID, "folder-1", "", 100); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(context.Background(), `SELECT name, size_bytes FROM drive_nodes
		WHERE drive_connection_id=$1 AND google_file_id='pdf-1'`, f.connID).Scan(&name, &size); err != nil {
		t.Fatal(err)
	}
	if name != "Reporte actualizado.pdf" || size == nil || *size != 3000000 {
		t.Fatalf("la segunda observación no actualizó metadatos: %s %v", name, size)
	}
	if err := f.pool.QueryRow(context.Background(), `SELECT p.parent_google_file_id
		FROM drive_node_parents p JOIN drive_nodes n ON n.id=p.drive_node_id
		WHERE n.drive_connection_id=$1 AND n.google_file_id='pdf-1'`, f.connID).Scan(&parent); err != nil {
		t.Fatal(err)
	}
	if parent != "folder-3" {
		t.Fatalf("el elemento movido conserva el padre anterior: %s", parent)
	}
}

func TestBrowsePaginationAndInvalidToken(t *testing.T) {
	f := newBrowseFixture(t)
	f.api.children["folder-1"] = []drivepkg.RemoteFile{{ID: "file-1", Name: "Primero", MimeType: "application/pdf", Parents: []string{"folder-1"}, CanDownload: true}}
	f.api.next["folder-1"] = "next-1"
	f.api.children["folder-1:next-1"] = []drivepkg.RemoteFile{{ID: "file-2", Name: "Segundo", MimeType: "application/pdf", Parents: []string{"folder-1"}, CanDownload: true}}

	first, err := f.service.Browse(context.Background(), f.userID, "folder-1", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Items) != 1 || first.NextPageToken != "next-1" {
		t.Fatalf("primera página incorrecta: %+v", first)
	}
	second, err := f.service.Browse(context.Background(), f.userID, "folder-1", first.NextPageToken, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Items) != 1 || second.Items[0].ID != "file-2" || second.NextPageToken != "" {
		t.Fatalf("segunda página incorrecta: %+v", second)
	}

	if _, err := f.service.Browse(context.Background(), f.userID, "folder-1", "invalid", 100); err == nil {
		t.Fatal("token de página inválido aceptado")
	} else {
		f.requireStatus(t, err, 400, "bad_request")
	}
}

func TestBrowseEmptyFolder(t *testing.T) {
	f := newBrowseFixture(t)
	f.api.children["folder-1"] = nil
	result, err := f.service.Browse(context.Background(), f.userID, "folder-1", "", 100)
	if err != nil {
		t.Fatal(err)
	}
	if result.Items == nil || len(result.Items) != 0 {
		t.Fatalf("carpeta vacía incorrecta: %+v", result.Items)
	}
}

func TestBrowseRejectsFileAsParent(t *testing.T) {
	f := newBrowseFixture(t)
	f.api.paths["file-1"] = []drivepkg.RemoteFile{{ID: "file-1", Name: "archivo.pdf", MimeType: "application/pdf", Parents: []string{"folder-1"}}}
	if _, err := f.service.Browse(context.Background(), f.userID, "file-1", "", 100); err == nil {
		t.Fatal("se permitió explorar un archivo")
	} else {
		f.requireStatus(t, err, 400, "bad_request")
	}
	if len(f.api.calls) != 0 {
		t.Fatal("se consultó el contenido antes de validar la carpeta")
	}
}

func TestBrowseRequiresConnectionAndPolicy(t *testing.T) {
	f := newBrowseFixture(t)
	areaID, positionID := helpers.SeedOrganization(t, f.pool, "Área Sin Drive", "Cargo Sin Drive")
	otherUser := helpers.SeedUser(t, f.pool, areaID, positionID, "active")
	if _, err := f.service.Browse(context.Background(), otherUser, "root", "", 100); err == nil {
		t.Fatal("se permitió explorar sin conexión")
	} else {
		f.requireStatus(t, err, 409, "drive_not_connected")
	}

	if _, err := f.pool.Exec(context.Background(), `UPDATE drive_connections
		SET policy_consent_version='old-version' WHERE id=$1`, f.connID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Browse(context.Background(), f.userID, "root", "", 100); err == nil {
		t.Fatal("se permitió explorar sin política vigente")
	} else {
		f.requireStatus(t, err, 409, "policy_consent_required")
	}
}

func TestBrowseTranslatesGoogleErrors(t *testing.T) {
	f := newBrowseFixture(t)
	f.api.listErr = &drivepkg.APIError{Code: "drive_rate_limited", Transient: true, Err: errors.New("quota")}
	if _, err := f.service.Browse(context.Background(), f.userID, "folder-1", "", 100); err == nil {
		t.Fatal("se ignoró el error de Google")
	} else {
		f.requireStatus(t, err, 502, "drive_error")
	}
}
