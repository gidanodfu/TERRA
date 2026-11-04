//go:build integration

package integration_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/migrations"
	"terra/tests/helpers"
)

func TestMigrationsSeedAndAudit(t *testing.T) {
	pool := helpers.Pool(t)
	var roles int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM system_roles
		WHERE key IN ('admin','user','moderator','read_only')`).Scan(&roles); err != nil {
		t.Fatal(err)
	}
	if roles != 4 {
		t.Fatalf("roles de sistema esperados=4, obtenidos=%d", roles)
	}
	repo := audit.NewRepository(pool)
	repo.Record(context.Background(), audit.Event{Action: "integration.test", TargetType: "test",
		TargetID: "abc", Metadata: map[string]any{"ok": true}})
	events, total, err := repo.List(context.Background(), audit.ListFilter{Page: 1, Size: 10})
	if err != nil || total != 1 || len(events) != 1 || events[0].Action != "integration.test" {
		t.Fatalf("auditoría: %v total=%d events=%v", err, total, events)
	}
}

func TestAdministrativeAccountMigrationPreservesTraceability(t *testing.T) {
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Legacy", "Cargo Legacy")
	adminID := seedAccount(t, pool, "Admin Legacy", []string{"admin"}, &areaID, &positionID, "active")

	sqlBytes, err := migrations.FS.ReadFile("0006_administrative_accounts_without_org.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), string(sqlBytes)); err != nil {
		t.Fatalf("migración correctiva: %v", err)
	}

	var currentArea, currentPosition *uuid.UUID
	if err := pool.QueryRow(context.Background(),
		`SELECT area_id, position_id FROM users WHERE id=$1`, adminID).Scan(&currentArea, &currentPosition); err != nil {
		t.Fatal(err)
	}
	if currentArea != nil || currentPosition != nil {
		t.Fatalf("la cuenta administrativa conserva asignación: area=%v cargo=%v", currentArea, currentPosition)
	}

	var previousArea, previousPosition *uuid.UUID
	if err := pool.QueryRow(context.Background(), `SELECT previous_area_id, previous_position_id
		FROM organization_history WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, adminID).
		Scan(&previousArea, &previousPosition); err != nil {
		t.Fatal(err)
	}
	if previousArea == nil || *previousArea != areaID || previousPosition == nil || *previousPosition != positionID {
		t.Fatalf("el historial no conserva la asignación anterior: area=%v cargo=%v", previousArea, previousPosition)
	}
}
