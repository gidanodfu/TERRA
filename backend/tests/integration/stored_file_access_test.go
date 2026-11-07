//go:build integration

package integration_test

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/audit"
	"terra/internal/downloads"
	drivepkg "terra/internal/drive"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/storage"
	"terra/tests/helpers"
)

func TestStoredFileAssociationAndAccessControl(t *testing.T) {
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Archivos", "Cargo Archivos")
	ownerID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	otherID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	adminID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	helpers.SeedPolicy(t, pool, "2026-11")
	connID := helpers.SeedConnection(t, pool, ownerID, "2026-11")

	ctx := context.Background()
	repo := downloads.NewRepository(pool)
	driveRepo := drivepkg.NewRepository(pool)
	job, _, err := repo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: adminID, DriveOwnerUserID: ownerID,
		DriveConnectionID: connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Archivos", PositionName: "Cargo Archivos", AreaSlug: "area-archivos",
		PositionSlug: "cargo-archivos", ScopeType: downloads.ScopeSelectedItems,
	}, nil, []downloads.FileRoot{{GoogleFileID: "file-1", FileName: "Reporte.pdf", SourcePath: "Reporte.pdf"}})
	if err != nil {
		t.Fatal(err)
	}

	nodeID, err := driveRepo.UpsertNode(ctx, connID, drivepkg.RemoteFile{
		ID: "file-1", Name: "Reporte.pdf", MimeType: "application/pdf", CanDownload: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	relativePath := "areas/x/Mi unidad/Reporte.pdf"
	if _, err := repo.CreateItem(ctx, job.ID, nodeID, relativePath, downloads.ItemPending, nil, "", ""); err != nil {
		t.Fatal(err)
	}

	items, total, err := repo.ListItems(ctx, job.ID, downloads.ItemFilter{Page: 1, Size: 10})
	if err != nil || total != 1 || len(items) != 1 {
		t.Fatalf("listado inicial: total=%d len=%d err=%v", total, len(items), err)
	}
	if items[0].StoredFileID != nil {
		t.Fatal("no debe existir stored_file_id antes de completar el elemento")
	}

	if err := repo.MarkCompleted(ctx, job.ID, ownerID, items[0].ID, nodeID, relativePath,
		7, "abcdef0123456789", "", "rev-1", nil); err != nil {
		t.Fatal(err)
	}
	items, _, err = repo.ListItems(ctx, job.ID, downloads.ItemFilter{Page: 1, Size: 10})
	if err != nil || len(items) != 1 || items[0].StoredFileID == nil {
		t.Fatalf("stored_file_id ausente tras completar: %+v err=%v", items, err)
	}
	storedID := *items[0].StoredFileID

	skippedNode, err := driveRepo.UpsertNode(ctx, connID, drivepkg.RemoteFile{
		ID: "file-2", Name: "Omitido.pdf", MimeType: "application/pdf", CanDownload: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CreateItem(ctx, job.ID, skippedNode, "areas/x/Mi unidad/Omitido.pdf",
		downloads.ItemPending, nil, "", ""); err != nil {
		t.Fatal(err)
	}
	var skippedItemID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT id FROM download_items WHERE job_id=$1 AND drive_node_id=$2`,
		job.ID, skippedNode).Scan(&skippedItemID); err != nil {
		t.Fatal(err)
	}
	if err := repo.MarkSkipped(ctx, skippedItemID, "not_downloadable", "No descargable"); err != nil {
		t.Fatal(err)
	}
	items, _, err = repo.ListItems(ctx, job.ID, downloads.ItemFilter{Status: downloads.ItemSkipped, Page: 1, Size: 10})
	if err != nil || len(items) != 1 || items[0].StoredFileID != nil {
		t.Fatalf("un elemento omitido no debe exponer archivo: %+v err=%v", items, err)
	}

	root := t.TempDir()
	store, err := storage.New(root, 1)
	if err != nil {
		t.Fatal(err)
	}
	absolute, err := store.Abs(relativePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(absolute), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(absolute, []byte("documento"), 0o640); err != nil {
		t.Fatal(err)
	}

	auditRepo := audit.NewRepository(pool)
	svc := downloads.NewService(config.Config{}, repo, nil, nil, store, auditRepo)

	file, info, meta, err := svc.OpenFile(ctx, ownerID, false, storedID, "ip-hash")
	if err != nil {
		t.Fatalf("descarga del propietario: %v", err)
	}
	file.Close()
	if info.Size() != int64(len("documento")) || meta.ID != storedID {
		t.Fatalf("metadatos de descarga incorrectos: %+v", meta)
	}

	_, _, _, err = svc.OpenFile(ctx, otherID, false, storedID, "ip-hash")
	var appErr *apperr.Error
	if !errors.As(err, &appErr) || appErr.Status != http.StatusForbidden {
		t.Fatalf("un tercero no debe descargar: %v", err)
	}
	if adminHandle, _, _, err := svc.OpenFile(ctx, adminID, true, storedID, "ip-hash"); err != nil {
		t.Fatalf("descarga administrativa: %v", err)
	} else {
		adminHandle.Close()
	}
	assertAuditCount(t, pool, "file.accessed", storedID, 2)

	if err := os.Remove(absolute); err != nil {
		t.Fatal(err)
	}
	_, _, _, err = svc.OpenFile(ctx, ownerID, false, storedID, "ip-hash")
	if !errors.As(err, &appErr) || appErr.Status != http.StatusNotFound {
		t.Fatalf("archivo físico ausente: %v", err)
	}
	assertAuditCount(t, pool, "file.access_failed", storedID, 1)

	_, _, _, err = svc.OpenFile(ctx, ownerID, false, uuid.New(), "ip-hash")
	if !errors.As(err, &appErr) || appErr.Status != http.StatusNotFound {
		t.Fatalf("identificador inválido: %v", err)
	}
}

func assertAuditCount(t *testing.T, pool *pgxpool.Pool, action string, targetID uuid.UUID, want int) {
	t.Helper()
	var got int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_events
		WHERE action=$1 AND target_type='stored_file' AND target_id=$2`, action, targetID.String()).Scan(&got); err != nil {
		t.Fatalf("auditoría %s: %v", action, err)
	}
	if got != want {
		t.Fatalf("eventos %s=%d, se esperaba %d", action, got, want)
	}
}
