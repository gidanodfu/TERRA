//go:build integration

package integration_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"

	"terra/internal/downloads"
	drivepkg "terra/internal/drive"
)

func selectionFixture(t *testing.T) *browseFixture {
	t.Helper()
	f := newBrowseFixture(t)
	f.api.paths = map[string][]drivepkg.RemoteFile{
		"folder-docs": {
			{ID: "folder-docs", Name: "Documentos", MimeType: drivepkg.MimeFolder, Parents: []string{"root-id"}},
		},
		"folder-reports": {
			{ID: "folder-docs", Name: "Documentos", MimeType: drivepkg.MimeFolder, Parents: []string{"root-id"}},
			{ID: "folder-reports", Name: "Informes", MimeType: drivepkg.MimeFolder, Parents: []string{"folder-docs"}},
		},
		"file-pdf": {
			{ID: "folder-docs", Name: "Documentos", MimeType: drivepkg.MimeFolder, Parents: []string{"root-id"}},
			{ID: "folder-reports", Name: "Informes", MimeType: drivepkg.MimeFolder, Parents: []string{"folder-docs"}},
			{ID: "file-pdf", Name: "Reporte.pdf", MimeType: "application/pdf", Parents: []string{"folder-reports"}, CanDownload: true, Size: 2048},
		},
		"file-xlsx": {
			{ID: "folder-docs", Name: "Documentos", MimeType: drivepkg.MimeFolder, Parents: []string{"root-id"}},
			{ID: "folder-reports", Name: "Informes", MimeType: drivepkg.MimeFolder, Parents: []string{"folder-docs"}},
			{ID: "file-xlsx", Name: "Personal.xlsx", MimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Parents: []string{"folder-reports"}, CanDownload: true},
		},
		"file-dng": {
			{ID: "file-dng", Name: "Fotografía.dng", MimeType: "image/x-adobe-dng", Parents: []string{"root-id"}, CanDownload: true, Size: 4096},
		},
		"file-form": {
			{ID: "file-form", Name: "Encuesta", MimeType: drivepkg.MimeForm, Parents: []string{"root-id"}, CanDownload: false},
		},
		"file-vids": {
			{ID: "file-vids", Name: "Video", MimeType: drivepkg.MimeVids, Parents: []string{"root-id"}, CanDownload: true},
		},
		"file-locked": {
			{ID: "file-locked", Name: "Bloqueado.bin", MimeType: "application/octet-stream", Parents: []string{"root-id"}, CanDownload: false},
		},
		"file-trashed": {
			{ID: "file-trashed", Name: "Eliminado.pdf", MimeType: "application/pdf", Parents: []string{"root-id"}, CanDownload: true, Trashed: true},
		},
		"file-shortcut": {
			{ID: "file-shortcut", Name: "Atajo", MimeType: drivepkg.MimeShortcut, Parents: []string{"root-id"}, IsShortcut: true, CanDownload: true},
		},
	}
	return f
}

func TestNormalizeSelectionsAllowsIndividualFiles(t *testing.T) {
	f := selectionFixture(t)
	ctx := context.Background()

	pdf, err := f.service.NormalizeSelections(ctx, f.userID, nil, []string{"file-pdf"})
	if err != nil {
		t.Fatalf("PDF individual: %v", err)
	}
	if len(pdf.Folders) != 0 || len(pdf.Files) != 1 {
		t.Fatalf("selección PDF inesperada: %+v", pdf)
	}
	if pdf.Files[0].SourcePath != "Documentos/Informes/Reporte.pdf" {
		t.Fatalf("ruta original=%q", pdf.Files[0].SourcePath)
	}

	dng, err := f.service.NormalizeSelections(ctx, f.userID, nil, []string{"file-dng"})
	if err != nil || len(dng.Files) != 1 || dng.Files[0].SourcePath != "Fotografía.dng" {
		t.Fatalf("DNG individual: %+v err=%v", dng, err)
	}
	xlsx, err := f.service.NormalizeSelections(ctx, f.userID, nil, []string{"file-xlsx"})
	if err != nil || len(xlsx.Files) != 1 || !strings.HasSuffix(xlsx.Files[0].SourcePath, "Personal.xlsx") {
		t.Fatalf("XLSX individual: %+v err=%v", xlsx, err)
	}

	multi, err := f.service.NormalizeSelections(ctx, f.userID, nil, []string{"file-pdf", "file-dng", "file-pdf"})
	if err != nil || len(multi.Files) != 2 {
		t.Fatalf("múltiples archivos o deduplicación: %+v err=%v", multi, err)
	}

	form, err := f.service.NormalizeSelections(ctx, f.userID, nil, []string{"file-form"})
	if err != nil || len(form.Files) != 1 {
		t.Fatalf("Google Forms debe poder seleccionarse: %+v err=%v", form, err)
	}
}

func TestNormalizeSelectionsCombinesAndRemovesRedundantItems(t *testing.T) {
	f := selectionFixture(t)
	ctx := context.Background()

	combined, err := f.service.NormalizeSelections(ctx, f.userID, []string{"folder-docs"}, []string{"file-dng"})
	if err != nil {
		t.Fatal(err)
	}
	if len(combined.Folders) != 1 || len(combined.Files) != 1 {
		t.Fatalf("combinación inesperada: %+v", combined)
	}

	covered, err := f.service.NormalizeSelections(ctx, f.userID, []string{"folder-docs"}, []string{"file-pdf"})
	if err != nil {
		t.Fatal(err)
	}
	if len(covered.Folders) != 1 || len(covered.Files) != 0 {
		t.Fatalf("el archivo cubierto debe eliminarse: %+v", covered)
	}

	nested, err := f.service.NormalizeSelections(ctx, f.userID, []string{"folder-docs", "folder-reports"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(nested.Folders) != 1 || nested.Folders[0].GoogleID != "folder-docs" {
		t.Fatalf("la carpeta descendiente debe eliminarse: %+v", nested)
	}
}

func TestNormalizeSelectionsRejectsInvalidItems(t *testing.T) {
	f := selectionFixture(t)
	ctx := context.Background()

	cases := []struct {
		name   string
		folder []string
		files  []string
	}{
		{"carpeta enviada como archivo", nil, []string{"folder-docs"}},
		{"archivo enviado como carpeta", []string{"file-pdf"}, nil},
		{"archivo no descargable", nil, []string{"file-locked"}},
		{"archivo en papelera", nil, []string{"file-trashed"}},
		{"atajo como archivo", nil, []string{"file-shortcut"}},
		{"Google Vids", nil, []string{"file-vids"}},
		{"sin selección", nil, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := f.service.NormalizeSelections(ctx, f.userID, tc.folder, tc.files); err == nil {
				t.Fatal("se aceptó una selección inválida")
			}
		})
	}
}

func TestRepositoryPersistsAndRestoresFileRoots(t *testing.T) {
	f := selectionFixture(t)
	ctx := context.Background()
	repo := downloads.NewRepository(f.pool)

	var areaID, positionID uuid.UUID
	if err := f.pool.QueryRow(ctx, `SELECT area_id, position_id FROM users WHERE id=$1`, f.userID).
		Scan(&areaID, &positionID); err != nil {
		t.Fatal(err)
	}
	jobID := uuid.New()
	job := &downloads.Job{
		ID: jobID, RequestedByUserID: f.userID, DriveOwnerUserID: f.userID,
		DriveConnectionID: f.connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Drive", PositionName: "Cargo Drive", AreaSlug: "area-drive",
		PositionSlug: "cargo-drive", ScopeType: downloads.ScopeSelectedItems,
		IdempotencyKey: "selected-items-" + jobID.String(),
	}
	created, isNew, err := repo.Create(ctx, job,
		[]downloads.Root{{GoogleFolderID: "folder-docs", FolderName: "Documentos", SourcePath: "Documentos"}},
		[]downloads.FileRoot{{GoogleFileID: "file-dng", FileName: "Fotografía.dng", SourcePath: "Fotografía.dng"}})
	if err != nil || !isNew {
		t.Fatalf("crear: %v new=%v", err, isNew)
	}
	if len(created.Roots) != 1 || len(created.FileRoots) != 1 || created.FileRoots[0].GoogleFileID != "file-dng" {
		t.Fatalf("raíces no recuperadas: %+v", created)
	}

	replayed, isNew, err := repo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: f.userID, DriveOwnerUserID: f.userID,
		DriveConnectionID: f.connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Drive", PositionName: "Cargo Drive", AreaSlug: "area-drive",
		PositionSlug: "cargo-drive", ScopeType: downloads.ScopeSelectedItems,
		IdempotencyKey: job.IdempotencyKey,
	}, nil, nil)
	if err != nil || isNew || replayed.ID != jobID || len(replayed.FileRoots) != 1 {
		t.Fatalf("idempotencia con archivos: %+v new=%v err=%v", replayed, isNew, err)
	}
}

func TestRepositoryCreatesOneItemPerFileRoot(t *testing.T) {
	f := selectionFixture(t)
	ctx := context.Background()
	repo := downloads.NewRepository(f.pool)
	driveRepo := drivepkg.NewRepository(f.pool)

	var areaID, positionID uuid.UUID
	if err := f.pool.QueryRow(ctx, `SELECT area_id, position_id FROM users WHERE id=$1`, f.userID).
		Scan(&areaID, &positionID); err != nil {
		t.Fatal(err)
	}
	job, _, err := repo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: f.userID, DriveOwnerUserID: f.userID,
		DriveConnectionID: f.connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Drive", PositionName: "Cargo Drive", AreaSlug: "area-drive",
		PositionSlug: "cargo-drive", ScopeType: downloads.ScopeSelectedItems,
	}, nil, []downloads.FileRoot{{GoogleFileID: "file-dng", FileName: "Fotografía.dng", SourcePath: "Fotografía.dng"}})
	if err != nil {
		t.Fatal(err)
	}
	nodeID, err := driveRepo.UpsertNode(ctx, f.connID, drivepkg.RemoteFile{
		ID: "file-dng", Name: "Fotografía.dng", MimeType: "image/x-adobe-dng", CanDownload: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	created, err := repo.CreateItem(ctx, job.ID, nodeID, "areas/x/Mi unidad/Fotografía.dng", downloads.ItemPending, nil, "", "")
	if err != nil || !created {
		t.Fatalf("primer item: %v created=%v", err, created)
	}
	created, err = repo.CreateItem(ctx, job.ID, nodeID, "areas/x/Mi unidad/Fotografía.dng", downloads.ItemPending, nil, "", "")
	if err != nil || created {
		t.Fatalf("item duplicado: %v created=%v", err, created)
	}
}
