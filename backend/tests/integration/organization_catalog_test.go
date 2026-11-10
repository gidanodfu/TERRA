//go:build integration

package integration_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/audit"
	"terra/internal/organization"
	"terra/internal/platform/apperr"
	"terra/internal/platform/validate"
	"terra/internal/users"
	"terra/tests/helpers"
)

func newOrganizationFixture(t *testing.T) (*organization.Service, *organization.Repository, *users.Repository, *pgxpool.Pool) {
	t.Helper()
	pool := helpers.Pool(t)
	repo := organization.NewRepository(pool)
	return organization.NewService(repo, audit.NewRepository(pool)), repo, users.NewRepository(pool), pool
}

func seedOrganizationActor(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	areaID, positionID := helpers.SeedOrganization(t, pool, "Actor Organización", "Cargo Actor")
	return helpers.SeedUser(t, pool, areaID, positionID, "active")
}

func hasCode(t *testing.T, err error, code string) bool {
	t.Helper()
	var appErr *apperr.Error
	return errors.As(err, &appErr) && appErr.Code == code
}

func TestOrganizationAreaUniqueness(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)

	area, err := svc.CreateArea(ctx, actor, "ip", "Recursos Humanos", []string{"Personal", "  Procesos   internos "})
	if err != nil {
		t.Fatal(err)
	}
	if len(area.Responsibilities) != 2 || area.Responsibilities[1] != "Procesos internos" {
		t.Fatalf("responsabilidades normalizadas: %v", area.Responsibilities)
	}

	for _, duplicate := range []string{
		"recursos humanos", "RECURSOS HUMANOS", "  Recursos   Humanos ",
	} {
		if _, err := svc.CreateArea(ctx, actor, "ip", duplicate, nil); !hasCode(t, err, "area_exists") {
			t.Fatalf("variante %q aceptada: %v", duplicate, err)
		}
	}

	// NFC: una forma descompuesta debe colisionar con su forma compuesta.
	if _, err := svc.CreateArea(ctx, actor, "ip", "José", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateArea(ctx, actor, "ip", "Jose\u0301", nil); !hasCode(t, err, "area_exists") {
		t.Fatalf("Unicode descompuesto no colisionó: %v", err)
	}
	if _, err := svc.CreateArea(ctx, actor, "ip", "Recursos Humanós", nil); err != nil {
		t.Fatalf("un nombre con acento distinto no debe colisionar: %v", err)
	}

	inactiveStatus := "inactive"
	if _, err := svc.UpdateArea(ctx, actor, "ip", area.ID, nil, &inactiveStatus, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateArea(ctx, actor, "ip", "recursos humanos", nil); !hasCode(t, err, "area_exists") {
		t.Fatalf("un área inactiva liberó su nombre: %v", err)
	}

	other, err := svc.CreateArea(ctx, actor, "ip", "Mesa de partes", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateArea(ctx, actor, "ip", area.ID, &other.Name, nil, nil); !hasCode(t, err, "area_exists") {
		t.Fatalf("se permitió renombrar a un nombre existente: %v", err)
	}
	if _, err := svc.UpdateArea(ctx, actor, "ip", area.ID, &area.Name, nil, nil); err != nil {
		t.Fatalf("conservar el propio nombre falló: %v", err)
	}

	// La base de datos es la autoridad final, incluso sin pasar por el servicio.
	_, err = pool.Exec(ctx, `INSERT INTO areas (id, name, slug, status)
		VALUES ($1, $2, $3, 'active')`, uuid.New(), "Mesa de Partes", "mesa-de-partes-"+uuid.NewString()[:8])
	if err == nil {
		t.Fatal("PostgreSQL aceptó un área duplicada")
	}
}

func TestOrganizationPositionUniqueness(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)

	areaA, err := svc.CreateArea(ctx, actor, "ip", "Área A", nil)
	if err != nil {
		t.Fatal(err)
	}
	areaB, err := svc.CreateArea(ctx, actor, "ip", "Área B", nil)
	if err != nil {
		t.Fatal(err)
	}
	position, err := svc.CreatePosition(ctx, actor, "ip", areaA.ID, "Secretaria", []string{"Recepción", "Expedientes"})
	if err != nil {
		t.Fatal(err)
	}
	if len(position.Responsibilities) != 2 {
		t.Fatalf("responsabilidades del cargo: %v", position.Responsibilities)
	}
	for _, duplicate := range []string{"secretaria", "  Secretaria  "} {
		if _, err := svc.CreatePosition(ctx, actor, "ip", areaA.ID, duplicate, nil); !hasCode(t, err, "position_exists") {
			t.Fatalf("cargo duplicado %q aceptado: %v", duplicate, err)
		}
	}
	if _, err := svc.CreatePosition(ctx, actor, "ip", areaB.ID, "Secretaria", nil); err != nil {
		t.Fatalf("el mismo cargo en otra área debe permitirse: %v", err)
	}

	inactive := "inactive"
	if _, err := svc.UpdatePosition(ctx, actor, "ip", position.ID, nil, &inactive, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreatePosition(ctx, actor, "ip", areaA.ID, "SECRETARIA", nil); !hasCode(t, err, "position_exists") {
		t.Fatalf("un cargo inactivo liberó su nombre: %v", err)
	}

	other, err := svc.CreatePosition(ctx, actor, "ip", areaA.ID, "Jefatura", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdatePosition(ctx, actor, "ip", other.ID, &position.Name, nil, nil); !hasCode(t, err, "position_exists") {
		t.Fatalf("se permitió renombrar a un cargo existente: %v", err)
	}
	if _, err := svc.UpdatePosition(ctx, actor, "ip", other.ID, &other.Name, nil, nil); err != nil {
		t.Fatalf("conservar el propio nombre falló: %v", err)
	}
}

func TestOrganizationResponsibilitiesValidation(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)

	invalid := [][]string{
		{""},
		{"recepción", "  Recepción "},
		make([]string, 21),
		{strings.Repeat("a", 301)},
	}
	for _, values := range invalid {
		if _, err := svc.CreateArea(ctx, actor, "ip", "Área válida", values); !hasCode(t, err, "validation_error") {
			t.Fatalf("responsabilidades inválidas aceptadas: %v (%v)", values, err)
		}
	}

	area, err := svc.CreateArea(ctx, actor, "ip", "Área responsabilidades", []string{"Primera"})
	if err != nil {
		t.Fatal(err)
	}
	updated := []string{"Primera actualizada", "Segunda"}
	area, err = svc.UpdateArea(ctx, actor, "ip", area.ID, nil, nil, &updated)
	if err != nil || len(area.Responsibilities) != 2 {
		t.Fatalf("actualizar responsabilidades: %v %+v", err, area)
	}
}

func TestOrganizationConcurrentAreaCreation(t *testing.T) {
	svc, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)
	start := make(chan struct{})
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			_, errs[index] = svc.CreateArea(ctx, actor, "ip", "Área Concurrente", nil)
		}(i)
	}
	close(start)
	wg.Wait()

	success, conflicts := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			success++
		case hasCode(t, err, "area_exists"):
			conflicts++
		default:
			t.Fatalf("error concurrente inesperado: %v", err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatalf("concurrencia: success=%d conflicts=%d (%v)", success, conflicts, errs)
	}
}

func TestOrganizationSQLNormalizationMatchesGo(t *testing.T) {
	_, _, _, pool := newOrganizationFixture(t)
	ctx := context.Background()
	for _, input := range []string{
		"  Recursos   Humanos ", "RECURSOS HUMANOS", "Recursos\tHumanos",
		"José", "Jose\u0301", "Área  de   Prueba",
	} {
		var got string
		if err := pool.QueryRow(ctx, `SELECT terra_normalize_org_name($1)`, input).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if want := validate.NormalizeName(input); got != want {
			t.Fatalf("normalización distinta para %q: SQL=%q Go=%q", input, got, want)
		}
	}
}

func TestOrganizationHistoryPreservesNames(t *testing.T) {
	pool := helpers.Pool(t)
	svc := organization.NewService(organization.NewRepository(pool), audit.NewRepository(pool))
	usersRepo := users.NewRepository(pool)
	ctx := context.Background()
	actor := seedOrganizationActor(t, pool)

	areaA, err := svc.CreateArea(ctx, actor, "ip", "Área Origen", nil)
	if err != nil {
		t.Fatal(err)
	}
	posA, err := svc.CreatePosition(ctx, actor, "ip", areaA.ID, "Cargo Origen", nil)
	if err != nil {
		t.Fatal(err)
	}
	areaB, err := svc.CreateArea(ctx, actor, "ip", "Área Destino", nil)
	if err != nil {
		t.Fatal(err)
	}
	posB, err := svc.CreatePosition(ctx, actor, "ip", areaB.ID, "Cargo Destino", nil)
	if err != nil {
		t.Fatal(err)
	}
	actorID := helpers.SeedUser(t, pool, areaA.ID, posA.ID, "active")
	workerID := helpers.SeedUser(t, pool, areaA.ID, posA.ID, "active")
	if _, err := usersRepo.AdminUpdate(ctx, workerID, &areaB.ID, &posB.ID, users.StatusActive, actorID); err != nil {
		t.Fatal(err)
	}
	// Renombrar después del cambio no debe alterar el nombre histórico.
	if _, err := svc.UpdateArea(ctx, actor, "ip", areaB.ID, strPtr("Área Destino Renombrada"), nil, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdatePosition(ctx, actor, "ip", posB.ID, strPtr("Cargo Destino Renombrado"), nil, nil); err != nil {
		t.Fatal(err)
	}
	history, err := organization.NewRepository(pool).History(ctx, workerID)
	if err != nil || len(history) == 0 {
		t.Fatalf("historial: %v %v", history, err)
	}
	if history[0].AreaName != "Área Destino" || history[0].PositionName != "Cargo Destino" {
		t.Fatalf("el historial perdió los nombres: %+v", history[0])
	}
}

func strPtr(value string) *string { return &value }
