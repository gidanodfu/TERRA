//go:build integration

package integration_test

import (
	"context"
	"testing"

	"terra/internal/audit"
	"terra/tests/helpers"
)

func TestMigrationsSeedAndAudit(t *testing.T) {
	pool := helpers.Pool(t)
	var roles int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM system_roles WHERE key IN ('admin','user')`).Scan(&roles); err != nil {
		t.Fatal(err)
	}
	if roles != 2 {
		t.Fatalf("roles de sistema esperados=2, obtenidos=%d", roles)
	}
	repo := audit.NewRepository(pool)
	repo.Record(context.Background(), audit.Event{Action: "integration.test", TargetType: "test",
		TargetID: "abc", Metadata: map[string]any{"ok": true}})
	events, total, err := repo.List(context.Background(), audit.ListFilter{Page: 1, Size: 10})
	if err != nil || total != 1 || len(events) != 1 || events[0].Action != "integration.test" {
		t.Fatalf("auditoría: %v total=%d events=%v", err, total, events)
	}
}
