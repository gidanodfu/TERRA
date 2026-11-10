//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"terra/internal/downloads"
	drivepkg "terra/internal/drive"
	"terra/tests/helpers"
)

func TestProgressSnapshotPersistsAndRecoversInterruptedItems(t *testing.T) {
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Progreso", "Cargo Progreso")
	ownerID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	adminID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	helpers.SeedPolicy(t, pool, "2026-11")
	connID := helpers.SeedConnection(t, pool, ownerID, "2026-11")

	ctx := context.Background()
	repo := downloads.NewRepository(pool)
	driveRepo := drivepkg.NewRepository(pool)
	job, _, err := repo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: adminID, DriveOwnerUserID: ownerID,
		DriveConnectionID: connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Progreso", PositionName: "Cargo Progreso", AreaSlug: "area-progreso",
		PositionSlug: "cargo-progreso", ScopeType: downloads.ScopeMyDriveFull,
		IdempotencyKey: "progress-integration",
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	nodeID, err := driveRepo.UpsertNode(ctx, connID, drivepkg.RemoteFile{
		ID: "progress-file", Name: "grande.bin", MimeType: "application/octet-stream", CanDownload: true, Size: 1000,
	})
	if err != nil {
		t.Fatal(err)
	}
	item := downloads.WorkerItem{ID: uuid.New(), DriveNodeID: nodeID, GoogleFileID: "progress-file",
		Name: "grande.bin", MimeType: "application/octet-stream", RelativePath: "areas/x/grande.bin", SizeBytes: ptrInt64(1000)}
	if _, err := repo.CreateItem(ctx, job.ID, nodeID, item.RelativePath, downloads.ItemPending, item.SizeBytes, "", ""); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT id FROM download_items WHERE job_id=$1 AND drive_node_id=$2`,
		job.ID, nodeID).Scan(&item.ID); err != nil {
		t.Fatal(err)
	}
	if ok, err := repo.MarkDownloading(ctx, item.ID); err != nil || !ok {
		t.Fatalf("marcar downloading: %v %v", err, ok)
	}

	tracker := downloads.NewJobProgressTracker(time.Now())
	expected := int64(1000)
	tracker.StartItem(item.ID, item.Name, &expected)
	_, _ = tracker.Writer(item.ID).Write(make([]byte, 250))
	job, err = repo.Get(ctx, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := repo.BuildProgress(ctx, job, tracker)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.InFlightBytes != 250 || snapshot.TransferredBytes != 250 || snapshot.UnknownSizeItems != 0 {
		t.Fatalf("snapshot inicial: %+v", snapshot)
	}
	if snapshot.ByteProgressPercent == nil || *snapshot.ByteProgressPercent != 25 {
		t.Fatalf("porcentaje exacto esperado: %+v", snapshot.ByteProgressPercent)
	}
	listener, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Release()
	if _, err := listener.Exec(ctx, "LISTEN terra_progress"); err != nil {
		t.Fatal(err)
	}
	revision, err := repo.SaveProgress(ctx, snapshot)
	if err != nil || revision != 1 {
		t.Fatalf("guardar progreso: revision=%d err=%v", revision, err)
	}
	notifyCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	notification, err := listener.Conn().WaitForNotification(notifyCtx)
	if err != nil {
		t.Fatalf("notificación de progreso: %v", err)
	}
	if notification.Channel != "terra_progress" || notification.Payload != job.ID.String() {
		t.Fatalf("notificación inesperada: %s %s", notification.Channel, notification.Payload)
	}
	stored, storedRevision, err := repo.GetProgress(ctx, job.ID)
	if err != nil || storedRevision != 1 || stored.InFlightBytes != 250 {
		t.Fatalf("progreso persistido: %+v revision=%d err=%v", stored, storedRevision, err)
	}

	if _, err := pool.Exec(ctx, `UPDATE download_jobs SET status='downloading',
		worker_lease_owner='worker-old', lease_expires_at=now() - interval '1 minute' WHERE id=$1`, job.ID); err != nil {
		t.Fatal(err)
	}
	claimed, err := repo.ClaimNext(ctx, "worker-new", time.Minute)
	if err != nil || claimed == nil || claimed.ID != job.ID {
		t.Fatalf("reclamo: %+v err=%v", claimed, err)
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM download_items WHERE id=$1`, item.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "pending" {
		t.Fatalf("el elemento interrumpido no volvió a pending: %s", status)
	}
	recovered, _, err := repo.GetProgress(ctx, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.InFlightBytes != 0 || len(recovered.ActiveDownloads) != 0 {
		t.Fatalf("el snapshot conservó bytes en vuelo del worker anterior: %+v", recovered)
	}
}

func ptrInt64(value int64) *int64 { return &value }

func TestProgressUnknownSizeDoesNotInventGlobalPercent(t *testing.T) {
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Desconocida", "Cargo Desconocido")
	ownerID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	adminID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	helpers.SeedPolicy(t, pool, "2026-11")
	connID := helpers.SeedConnection(t, pool, ownerID, "2026-11")
	ctx := context.Background()
	repo := downloads.NewRepository(pool)
	driveRepo := drivepkg.NewRepository(pool)
	job, _, err := repo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: adminID, DriveOwnerUserID: ownerID,
		DriveConnectionID: connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Desconocida", PositionName: "Cargo Desconocido", AreaSlug: "area-desconocida",
		PositionSlug: "cargo-desconocido", ScopeType: downloads.ScopeMyDriveFull,
		IdempotencyKey: "progress-unknown",
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	nodeID, err := driveRepo.UpsertNode(ctx, connID, drivepkg.RemoteFile{
		ID: "unknown-file", Name: "desconocido.bin", MimeType: "application/octet-stream", CanDownload: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CreateItem(ctx, job.ID, nodeID, "areas/x/desconocido.bin", downloads.ItemPending, nil, "", ""); err != nil {
		t.Fatal(err)
	}
	job, err = repo.Get(ctx, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := repo.BuildProgress(ctx, job, nil)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.UnknownSizeItems != 1 || snapshot.ByteProgressPercent != nil {
		t.Fatalf("un tamaño desconocido no debe producir porcentaje global: %+v", snapshot)
	}
}
