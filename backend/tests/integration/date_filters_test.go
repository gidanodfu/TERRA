//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/downloads"
	"terra/tests/helpers"
)

func TestDateFiltersIncludeWholeLastDay(t *testing.T) {
	pool := helpers.Pool(t)
	ctx := context.Background()
	from := time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
	toExclusive := time.Date(2026, 11, 11, 0, 0, 0, 0, time.UTC)

	for _, event := range []struct {
		action string
		at     time.Time
	}{
		{"date.before", time.Date(2026, 11, 9, 23, 59, 59, 999999999, time.UTC)},
		{"date.inside", time.Date(2026, 11, 10, 23, 59, 59, 999999999, time.UTC)},
		{"date.after", time.Date(2026, 11, 11, 0, 0, 0, 0, time.UTC)},
	} {
		if _, err := pool.Exec(ctx, `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, metadata_json, created_at)
			VALUES (NULL,$1,'test','target','{}'::jsonb,$2)`, event.action, event.at); err != nil {
			t.Fatal(err)
		}
	}
	events, total, err := audit.NewRepository(pool).List(ctx, audit.ListFilter{
		From: &from, To: &toExclusive, Page: 1, Size: 10, Scope: audit.ScopeFull,
	})
	if err != nil || total != 1 || len(events) != 1 || events[0].Action != "date.inside" {
		t.Fatalf("auditoría por rango: total=%d events=%v err=%v", total, events, err)
	}

	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Fechas", "Cargo Fechas")
	ownerID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	adminID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	helpers.SeedPolicy(t, pool, "2026-11")
	connID := helpers.SeedConnection(t, pool, ownerID, "2026-11")
	repo := downloads.NewRepository(pool)
	ids := make([]uuid.UUID, 0, 3)
	for index, at := range []time.Time{
		time.Date(2026, 11, 9, 23, 59, 59, 999999999, time.UTC),
		time.Date(2026, 11, 10, 23, 59, 59, 999999999, time.UTC),
		time.Date(2026, 11, 11, 0, 0, 0, 0, time.UTC),
	} {
		job, _, err := repo.Create(ctx, &downloads.Job{
			ID: uuid.New(), RequestedByUserID: adminID, DriveOwnerUserID: ownerID,
			DriveConnectionID: connID, AreaID: areaID, PositionID: positionID,
			AreaName: "Área Fechas", PositionName: "Cargo Fechas", AreaSlug: "area-fechas",
			PositionSlug: "cargo-fechas", ScopeType: downloads.ScopeMyDriveFull,
			IdempotencyKey: "date-" + at.Format("20060102") + "-" + string(rune('a'+index)),
		}, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `UPDATE download_jobs SET created_at=$2 WHERE id=$1`, job.ID, at); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, job.ID)
	}
	jobs, total, err := repo.List(ctx, downloads.ListFilter{From: &from, To: &toExclusive, Page: 1, Size: 10})
	if err != nil || total != 1 || len(jobs) != 1 || jobs[0].ID != ids[1] {
		t.Fatalf("trabajos por rango: total=%d jobs=%v err=%v", total, jobs, err)
	}
}
