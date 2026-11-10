//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type responsibilityAudit struct {
	Changed bool     `json:"changed"`
	Before  []string `json:"before"`
	After   []string `json:"after"`
}

type organizationAuditMetadata struct {
	Name             string               `json:"name"`
	Status           string               `json:"status"`
	AreaID           string               `json:"area_id"`
	Responsibilities *responsibilityAudit `json:"responsibilities"`
}

func latestOrganizationAudit(t *testing.T, pool *pgxpool.Pool, action, targetID string) organizationAuditMetadata {
	t.Helper()
	var raw []byte
	if err := pool.QueryRow(context.Background(), `SELECT metadata_json FROM audit_events
		WHERE action=$1 AND target_id=$2 ORDER BY id DESC LIMIT 1`, action, targetID).Scan(&raw); err != nil {
		t.Fatalf("auditoría %s/%s: %v", action, targetID, err)
	}
	var metadata organizationAuditMetadata
	if err := json.Unmarshal(raw, &metadata); err != nil {
		t.Fatalf("metadata de auditoría: %v (%s)", err, raw)
	}
	return metadata
}

func organizationAuditCount(t *testing.T, pool *pgxpool.Pool, action, targetID string) int {
	t.Helper()
	var count int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM audit_events
		WHERE action=$1 AND target_id=$2`, action, targetID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func assertStrings(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: got=%v want=%v", label, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s: got=%v want=%v", label, got, want)
		}
	}
}

func TestOrganizationAuditResponsibilitiesCreation(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)

	area, err := svc.CreateArea(ctx, actor, "ip", "Área Auditada", []string{"Primera", "Segunda"})
	if err != nil {
		t.Fatal(err)
	}
	event := latestOrganizationAudit(t, pool, "area.created", area.ID.String())
	if event.Responsibilities == nil || event.Responsibilities.Changed {
		t.Fatalf("responsabilidades iniciales del área: %+v", event.Responsibilities)
	}
	assertStrings(t, "área creada", event.Responsibilities.After, []string{"Primera", "Segunda"})

	emptyArea, err := svc.CreateArea(ctx, actor, "ip", "Área Sin Responsabilidades", nil)
	if err != nil {
		t.Fatal(err)
	}
	emptyEvent := latestOrganizationAudit(t, pool, "area.created", emptyArea.ID.String())
	if emptyEvent.Responsibilities == nil || emptyEvent.Responsibilities.After == nil ||
		len(emptyEvent.Responsibilities.After) != 0 {
		t.Fatalf("la lista vacía debe serializarse como []: %+v", emptyEvent.Responsibilities)
	}

	position, err := svc.CreatePosition(ctx, actor, "ip", area.ID, "Cargo Auditado", []string{"Recepción", "Expedientes"})
	if err != nil {
		t.Fatal(err)
	}
	posEvent := latestOrganizationAudit(t, pool, "position.created", position.ID.String())
	if posEvent.Responsibilities == nil || posEvent.AreaID != area.ID.String() {
		t.Fatalf("evento de cargo creado: %+v", posEvent)
	}
	assertStrings(t, "cargo creado", posEvent.Responsibilities.After, []string{"Recepción", "Expedientes"})

	emptyPosition, err := svc.CreatePosition(ctx, actor, "ip", area.ID, "Cargo Sin Responsabilidades", nil)
	if err != nil {
		t.Fatal(err)
	}
	emptyPosEvent := latestOrganizationAudit(t, pool, "position.created", emptyPosition.ID.String())
	if emptyPosEvent.Responsibilities == nil || emptyPosEvent.Responsibilities.After == nil ||
		len(emptyPosEvent.Responsibilities.After) != 0 {
		t.Fatalf("cargo sin responsabilidades: %+v", emptyPosEvent.Responsibilities)
	}
}

func TestOrganizationAuditResponsibilitiesUpdates(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)

	area, err := svc.CreateArea(ctx, actor, "ip", "Área Cambios", []string{"Uno", "Dos"})
	if err != nil {
		t.Fatal(err)
	}
	update := func(responsibilities []string) organizationAuditMetadata {
		t.Helper()
		updated, err := svc.UpdateArea(ctx, actor, "ip", area.ID, nil, nil, &responsibilities)
		if err != nil {
			t.Fatal(err)
		}
		area = updated
		return latestOrganizationAudit(t, pool, "area.updated", area.ID.String())
	}

	event := update([]string{"Uno", "Dos", "Tres"})
	if event.Responsibilities == nil || !event.Responsibilities.Changed {
		t.Fatalf("alta de responsabilidad no auditada: %+v", event.Responsibilities)
	}
	assertStrings(t, "alta before", event.Responsibilities.Before, []string{"Uno", "Dos"})
	assertStrings(t, "alta after", event.Responsibilities.After, []string{"Uno", "Dos", "Tres"})

	event = update([]string{"Uno"})
	assertStrings(t, "baja before", event.Responsibilities.Before, []string{"Uno", "Dos", "Tres"})
	assertStrings(t, "baja after", event.Responsibilities.After, []string{"Uno"})

	event = update([]string{"Uno actualizado"})
	assertStrings(t, "edición before", event.Responsibilities.Before, []string{"Uno"})
	assertStrings(t, "edición after", event.Responsibilities.After, []string{"Uno actualizado"})

	event = update([]string{"Nueva", "Uno actualizado"})
	assertStrings(t, "orden before", event.Responsibilities.Before, []string{"Uno actualizado"})
	assertStrings(t, "orden after", event.Responsibilities.After, []string{"Nueva", "Uno actualizado"})

	event = update([]string{})
	if event.Responsibilities == nil || event.Responsibilities.After == nil || len(event.Responsibilities.After) != 0 {
		t.Fatalf("eliminar todas debe registrar after=[]: %+v", event.Responsibilities)
	}
	if len(event.Responsibilities.Before) != 2 {
		t.Fatalf("before de eliminación total: %v", event.Responsibilities.Before)
	}

	newName := "Área Cambios Renombrada"
	if _, err := svc.UpdateArea(ctx, actor, "ip", area.ID, &newName, nil, nil); err != nil {
		t.Fatal(err)
	}
	event = latestOrganizationAudit(t, pool, "area.updated", area.ID.String())
	if event.Responsibilities != nil {
		t.Fatalf("un cambio solo de nombre no debe incluir responsabilidades: %+v", event.Responsibilities)
	}

	position, err := svc.CreatePosition(ctx, actor, "ip", area.ID, "Cargo Cambios", []string{"A"})
	if err != nil {
		t.Fatal(err)
	}
	positionResp := []string{"A", "B"}
	if _, err := svc.UpdatePosition(ctx, actor, "ip", position.ID, nil, nil, &positionResp); err != nil {
		t.Fatal(err)
	}
	posEvent := latestOrganizationAudit(t, pool, "position.updated", position.ID.String())
	if posEvent.Responsibilities == nil || !posEvent.Responsibilities.Changed {
		t.Fatalf("cambio de cargo no auditado: %+v", posEvent.Responsibilities)
	}
	assertStrings(t, "cargo before", posEvent.Responsibilities.Before, []string{"A"})
	assertStrings(t, "cargo after", posEvent.Responsibilities.After, []string{"A", "B"})

	inactive := "inactive"
	if _, err := svc.UpdateArea(ctx, actor, "ip", area.ID, nil, &inactive, nil); err != nil {
		t.Fatal(err)
	}
	event = latestOrganizationAudit(t, pool, "area.updated", area.ID.String())
	if event.Responsibilities != nil {
		t.Fatalf("un cambio solo de estado no debe incluir responsabilidades: %+v", event.Responsibilities)
	}
	var persisted []string
	if err := pool.QueryRow(ctx, `SELECT responsibilities FROM areas WHERE id=$1`, area.ID).Scan(&persisted); err != nil {
		t.Fatal(err)
	}
	if len(persisted) != 0 {
		t.Fatalf("el cambio de estado alteró responsabilidades: %v", persisted)
	}

}

func TestOrganizationAuditTransactionRollback(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)
	missingActor := uuid.New()

	if _, err := svc.CreateArea(ctx, missingActor, "ip", "Área Sin Auditoría", nil); err == nil {
		t.Fatal("la creación debía fallar si la auditoría no puede insertarse")
	}
	var areas int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM areas WHERE name='Área Sin Auditoría'`).Scan(&areas); err != nil {
		t.Fatal(err)
	}
	if areas != 0 {
		t.Fatal("la creación se confirmó sin su evento de auditoría")
	}

	area, err := svc.CreateArea(ctx, actor, "ip", "Área Rollback", []string{"Original"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreatePosition(ctx, missingActor, "ip", area.ID, "Cargo Sin Auditoría", nil); err == nil {
		t.Fatal("la creación del cargo debía fallar si la auditoría no puede insertarse")
	}
	var positions int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM positions WHERE name='Cargo Sin Auditoría'`).Scan(&positions); err != nil {
		t.Fatal(err)
	}
	if positions != 0 {
		t.Fatal("el cargo se confirmó sin su evento de auditoría")
	}

	position, err := svc.CreatePosition(ctx, actor, "ip", area.ID, "Cargo Rollback", []string{"Original"})
	if err != nil {
		t.Fatal(err)
	}
	positionName := "Cargo Rollback Modificado"
	if _, err := svc.UpdatePosition(ctx, missingActor, "ip", position.ID, &positionName, nil, nil); err == nil {
		t.Fatal("la actualización del cargo debía fallar si la auditoría no puede insertarse")
	}
	var persistedPositionName string
	if err := pool.QueryRow(ctx, `SELECT name FROM positions WHERE id=$1`, position.ID).Scan(&persistedPositionName); err != nil {
		t.Fatal(err)
	}
	if persistedPositionName != "Cargo Rollback" {
		t.Fatalf("el cargo se confirmó sin auditoría: %s", persistedPositionName)
	}
	if count := organizationAuditCount(t, pool, "position.updated", position.ID.String()); count != 0 {
		t.Fatalf("eventos de cargo tras rollback: %d", count)
	}

	newName := "Área Rollback Modificada"
	if _, err := svc.UpdateArea(ctx, missingActor, "ip", area.ID, &newName, nil, nil); err == nil {
		t.Fatal("la actualización debía fallar si la auditoría no puede insertarse")
	}
	var name string
	if err := pool.QueryRow(ctx, `SELECT name FROM areas WHERE id=$1`, area.ID).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Área Rollback" {
		t.Fatalf("la actualización se confirmó sin auditoría: %s", name)
	}
	if count := organizationAuditCount(t, pool, "area.updated", area.ID.String()); count != 0 {
		t.Fatalf("eventos de actualización tras rollback: %d", count)
	}

	updatedResp := []string{"Actualizada"}
	if _, err := svc.UpdateArea(ctx, actor, "ip", area.ID, nil, nil, &updatedResp); err != nil {
		t.Fatal(err)
	}
	if count := organizationAuditCount(t, pool, "area.updated", area.ID.String()); count != 1 {
		t.Fatalf("evento duplicado o ausente: %d", count)
	}
	var actorID uuid.UUID
	if err := pool.QueryRow(ctx, `SELECT actor_user_id FROM audit_events
		WHERE action='area.updated' AND target_id=$1`, area.ID.String()).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	if actorID != actor {
		t.Fatalf("actor de auditoría incorrecto: %s", actorID)
	}
}

func TestOrganizationAuditConcurrentUpdates(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)

	area, err := svc.CreateArea(ctx, actor, "ip", "Área Concurrente Auditoría", []string{"Inicial"})
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for index, values := range [][]string{{"Primera"}, {"Segunda"}} {
		wg.Add(1)
		go func(index int, values []string) {
			defer wg.Done()
			<-start
			_, errs[index] = svc.UpdateArea(ctx, actor, "ip", area.ID, nil, nil, &values)
		}(index, values)
	}
	close(start)
	wg.Wait()
	for _, err := range errs {
		if err != nil {
			t.Fatalf("actualización concurrente: %v", err)
		}
	}

	rows, err := pool.Query(ctx, `SELECT metadata_json FROM audit_events
		WHERE action='area.updated' AND target_id=$1 ORDER BY id`, area.ID.String())
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var events []organizationAuditMetadata
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var metadata organizationAuditMetadata
		if err := json.Unmarshal(raw, &metadata); err != nil {
			t.Fatal(err)
		}
		events = append(events, metadata)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 {
		t.Fatalf("eventos concurrentes=%d", len(events))
	}
	assertStrings(t, "primera before", events[0].Responsibilities.Before, []string{"Inicial"})
	assertStrings(t, "segunda before", events[1].Responsibilities.Before, events[0].Responsibilities.After)
	if len(events[1].Responsibilities.After) != 1 {
		t.Fatalf("after final inesperado: %v", events[1].Responsibilities.After)
	}

	var final []string
	if err := pool.QueryRow(ctx, `SELECT responsibilities FROM areas WHERE id=$1`, area.ID).Scan(&final); err != nil {
		t.Fatal(err)
	}
	assertStrings(t, "estado final", final, events[1].Responsibilities.After)
}
