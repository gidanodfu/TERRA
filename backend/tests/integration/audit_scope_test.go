//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"

	"terra/internal/audit"
)

type auditResponse struct {
	Data       []audit.Event `json:"data"`
	Pagination struct {
		Total int `json:"total"`
	} `json:"pagination"`
}

func seedAuditEvents(t *testing.T, f *accountFixture) []string {
	t.Helper()
	events := []audit.Event{
		{ActorUserID: &f.adminID, Action: "download_job.created", TargetType: "download_job", TargetID: "job-1",
			Metadata: map[string]any{"scope_type": "selected_items", "roots": 1, "file_roots": 1, "selected_total": 2,
				"owner_user_id": "sensible", "idempotency_key": "secreto"}},
		{ActorUserID: &f.adminID, Action: "admin.user.updated", TargetType: "user", TargetID: "worker-1",
			Metadata: map[string]any{"kind": "worker", "previous_status": "active", "status": "suspended",
				"area_id": "area-1", "position_id": "position-1", "result": "applied"}},
		{ActorUserID: &f.adminID, Action: "admin.user.updated", TargetType: "user", TargetID: "admin-1",
			Metadata: map[string]any{"kind": "admin"}},
		{ActorUserID: &f.adminID, Action: "auth.admin.login", TargetType: "user", TargetID: "admin-1"},
		{ActorUserID: &f.adminID, Action: "auth.password.changed", TargetType: "user", TargetID: "admin-1"},
		{ActorUserID: &f.adminID, Action: "admin.account.created", TargetType: "user", TargetID: "admin-2"},
		{ActorUserID: &f.adminID, Action: "policy.published", TargetType: "policy", TargetID: "2026-12"},
		{ActorUserID: &f.adminID, Action: "file.accessed", TargetType: "stored_file", TargetID: "file-1"},
		{ActorUserID: &f.adminID, Action: "area.updated", TargetType: "area", TargetID: "area-1"},
		{ActorUserID: &f.adminID, Action: "drive.connected", TargetType: "drive_connection", TargetID: "conn-1",
			Metadata: map[string]any{"email": "persona@example.test"}},
		{ActorUserID: &f.adminID, Action: "user.profile.updated", TargetType: "user", TargetID: "worker-1",
			Metadata: map[string]any{"area_id": "area-1", "position_id": "position-1", "extra": "no"}},
		{ActorUserID: &f.adminID, Action: "policy.accepted", TargetType: "policy", TargetID: "2026-11"},
		{ActorUserID: &f.adminID, Action: "download_job.cancel_requested", TargetType: "download_job", TargetID: "job-1"},
		{ActorUserID: &f.adminID, Action: "download_job.retried", TargetType: "download_job", TargetID: "job-1"},
	}
	repo := audit.NewRepository(f.pool)
	actions := make([]string, 0, len(events))
	for _, event := range events {
		repo.Record(context.Background(), event)
		actions = append(actions, event.Action)
	}
	return actions
}

func listAudit(t *testing.T, f *accountFixture, actor uuid.UUID, query string) (int, auditResponse, string) {
	t.Helper()
	rec := f.serve(t, http.HandlerFunc(f.adminHandler.AuditEvents), actor,
		http.MethodGet, "/api/v1/admin/audit-events"+query, "", nil)
	body := rec.Body.String()
	if rec.Code != http.StatusOK {
		return rec.Code, auditResponse{}, body
	}
	var payload auditResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("audit JSON: %v", err)
	}
	return rec.Code, payload, body
}

func actionsOf(events []audit.Event) map[string]int {
	out := map[string]int{}
	for _, event := range events {
		out[event.Action]++
	}
	return out
}

func TestAuditScopeSeparatesFullAndOperational(t *testing.T) {
	f := newAccountFixture(t)
	all := seedAuditEvents(t, f)

	adminStatus, admin, _ := listAudit(t, f, f.adminID, "?page=1&page_size=100")
	if adminStatus != http.StatusOK || admin.Pagination.Total != len(all) {
		t.Fatalf("admin: status=%d total=%d, se esperaba %d", adminStatus, admin.Pagination.Total, len(all))
	}
	readStatus, readOnly, _ := listAudit(t, f, f.readOnlyID, "?page=1&page_size=100")
	if readStatus != http.StatusOK || readOnly.Pagination.Total != len(all) {
		t.Fatalf("solo lectura: status=%d total=%d", readStatus, readOnly.Pagination.Total)
	}

	status, operational, raw := listAudit(t, f, f.moderatorID, "?page=1&page_size=100")
	if status != http.StatusOK {
		t.Fatalf("moderador: status=%d", status)
	}
	allowed := []string{
		"admin.user.updated", "user.profile.updated", "drive.connected", "drive.disconnected",
		"download_job.created", "download_job.cancel_requested", "download_job.retried", "policy.accepted",
	}
	operationalActions := map[string]bool{}
	for _, action := range allowed {
		operationalActions[action] = true
	}
	for _, event := range operational.Data {
		if !operationalActions[event.Action] {
			t.Fatalf("evento no operacional: %s", event.Action)
		}
		if event.Action == "admin.user.updated" && event.Metadata["kind"] != "worker" {
			t.Fatalf("moderador recibió admin.user.updated de %v", event.Metadata["kind"])
		}
		if _, ok := event.Metadata["ip_hash"]; ok {
			t.Fatal("la auditoría expone ip_hash")
		}
	}
	if got := actionsOf(operational.Data)["admin.user.updated"]; got != 1 {
		t.Fatalf("admin.user.updated del moderador=%d, se esperaba solo el de trabajador", got)
	}
	for _, excluded := range []string{
		"auth.admin.login", "auth.password.changed", "admin.account.created", "policy.published",
		"file.accessed", "area.updated",
	} {
		if actionsOf(operational.Data)[excluded] != 0 {
			t.Fatalf("el moderador recibió %s", excluded)
		}
	}
	if strings.Contains(raw, "persona@example.test") || strings.Contains(raw, "idempotency_key") || strings.Contains(raw, "ip_hash") {
		t.Fatalf("metadatos sensibles expuestos: %s", raw)
	}
	for _, event := range operational.Data {
		if event.Action == "drive.connected" && len(event.Metadata) != 0 {
			t.Fatalf("drive.connected debería devolver metadatos vacíos: %v", event.Metadata)
		}
		if event.Action == "download_job.created" {
			if len(event.Metadata) != 4 || event.Metadata["scope_type"] == nil || event.Metadata["selected_total"] == nil {
				t.Fatalf("metadatos de download_job.created inesperados: %v", event.Metadata)
			}
		}
	}

	// El cliente no puede elevar el alcance con parámetros.
	status, elevated, _ := listAudit(t, f, f.moderatorID, "?page=1&page_size=100&scope=full")
	if status != http.StatusOK || elevated.Pagination.Total != operational.Pagination.Total {
		t.Fatalf("scope=full alteró el alcance: status=%d total=%d", status, elevated.Pagination.Total)
	}
	if _, _, err := audit.NewRepository(f.pool).List(context.Background(), audit.ListFilter{
		Scope: audit.ScopeOperational, Action: "auth.admin.login", Page: 1, Size: 100,
	}); err != nil {
		t.Fatalf("repositorio operacional con filtro: %v", err)
	}
	status, filtered, _ := listAudit(t, f, f.moderatorID, "?page=1&page_size=100&action=auth.admin.login")
	if status != http.StatusOK || filtered.Pagination.Total != 0 || len(filtered.Data) != 0 {
		t.Fatalf("el moderador pudo filtrar un evento excluido: status=%d total=%d", status, filtered.Pagination.Total)
	}

	status, actorFiltered, _ := listAudit(t, f, f.moderatorID, "?page=1&page_size=100&actor_id="+f.adminID.String())
	if status != http.StatusOK || actorFiltered.Pagination.Total != operational.Pagination.Total {
		t.Fatalf("filtro actor_id: status=%d total=%d", status, actorFiltered.Pagination.Total)
	}
	status, dateFiltered, _ := listAudit(t, f, f.moderatorID, "?page=1&page_size=100&from=2099-01-01")
	if status != http.StatusOK || dateFiltered.Pagination.Total != 0 {
		t.Fatalf("filtro de fecha: status=%d total=%d", status, dateFiltered.Pagination.Total)
	}

	// La paginación usa el total ya acotado.
	status, page, _ := listAudit(t, f, f.moderatorID, "?page=1&page_size=2")
	if status != http.StatusOK || page.Pagination.Total != operational.Pagination.Total || len(page.Data) != 2 {
		t.Fatalf("paginación operacional: status=%d total=%d len=%d", status, page.Pagination.Total, len(page.Data))
	}

	if status, _, _ := listAudit(t, f, f.workerID, "?page=1&page_size=10"); status != http.StatusForbidden {
		t.Fatalf("trabajador: status=%d, se esperaba 403", status)
	}
}
