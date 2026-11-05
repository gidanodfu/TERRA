//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"terra/internal/downloads"
	"terra/tests/helpers"
)

func TestQueueClaimIdempotencyAndCancel(t *testing.T) {
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Cola", "Cargo Cola")
	ownerID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	adminID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	helpers.SeedPolicy(t, pool, "test-policy")
	connID := helpers.SeedConnection(t, pool, ownerID, "test-policy")

	repo := downloads.NewRepository(pool)
	ctx := context.Background()
	jobID := uuid.New()
	job := &downloads.Job{
		ID: jobID, RequestedByUserID: adminID, DriveOwnerUserID: ownerID,
		DriveConnectionID: connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Cola", PositionName: "Cargo Cola", AreaSlug: "area-cola",
		PositionSlug: "cargo-cola", ScopeType: downloads.ScopeMyDriveFull,
		IdempotencyKey: "idem-integration",
	}
	created, isNew, err := repo.Create(ctx, job, nil, nil)
	if err != nil || !isNew || created.ID != jobID {
		t.Fatalf("crear job: %v new=%v id=%v", err, isNew, created)
	}
	replayed, isNew, err := repo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: adminID, DriveOwnerUserID: ownerID,
		DriveConnectionID: connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Cola", PositionName: "Cargo Cola", AreaSlug: "area-cola",
		PositionSlug: "cargo-cola", ScopeType: downloads.ScopeMyDriveFull,
		IdempotencyKey: "idem-integration",
	}, nil, nil)
	if err != nil || isNew || replayed.ID != jobID {
		t.Fatalf("idempotencia: %v new=%v id=%v", err, isNew, replayed.ID)
	}

	claimed, err := repo.ClaimNext(ctx, "worker-1", time.Minute)
	if err != nil || claimed == nil || claimed.ID != jobID {
		t.Fatalf("claim worker1: %v %v", err, claimed)
	}
	second, err := repo.ClaimNext(ctx, "worker-2", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if second != nil {
		t.Fatalf("el lease activo no debe reclamarse: %v", second.ID)
	}
	status, cancel, err := repo.Heartbeat(ctx, jobID, "worker-1", time.Minute)
	if err != nil || status != downloads.JobScanning || cancel {
		t.Fatalf("heartbeat: status=%s cancel=%v err=%v", status, cancel, err)
	}
	cancelled, err := repo.RequestCancel(ctx, jobID)
	if err != nil || cancelled.Status != downloads.JobCancelRequested {
		t.Fatalf("cancel request: %v status=%s", err, cancelled.Status)
	}
	_, cancel, err = repo.Heartbeat(ctx, jobID, "worker-1", time.Minute)
	if err != nil || !cancel {
		t.Fatalf("heartbeat debe reportar cancelación: %v cancel=%v", err, cancel)
	}
	if err := repo.CancelPending(ctx, jobID); err != nil {
		t.Fatal(err)
	}
	if err := repo.Finish(ctx, jobID, "worker-1", downloads.JobCancelled, "cancelled", "test"); err != nil {
		t.Fatal(err)
	}
	final, err := repo.Get(ctx, jobID)
	if err != nil || final.Status != downloads.JobCancelled {
		t.Fatalf("estado final: %v %s", err, final.Status)
	}

	repo.AddEvent(ctx, jobID, "job.test", map[string]any{"ok": true})
	events, err := repo.EventsAfter(ctx, jobID, 0, 10)
	if err != nil || len(events) == 0 || events[0].Type != "job.test" {
		t.Fatalf("eventos: %v %v", err, events)
	}

	list, total, err := repo.List(ctx, downloads.ListFilter{RestrictToUser: &ownerID, Page: 1, Size: 10})
	if err != nil || total != 1 || len(list) != 1 {
		t.Fatalf("listado restringido: %v total=%d list=%d", err, total, len(list))
	}
}
