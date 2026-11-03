//go:build integration

package integration_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"terra/tests/helpers"
)

func TestOrganizationCompositeConstraint(t *testing.T) {
	pool := helpers.Pool(t)
	areaA, positionA := helpers.SeedOrganization(t, pool, "Área A", "Cargo A")
	areaB, positionB := helpers.SeedOrganization(t, pool, "Área B", "Cargo B")

	_, err := pool.Exec(context.Background(), `INSERT INTO users
		(id,first_name,last_name,display_name,email,area_id,position_id,status)
		VALUES ($1,'Bad','FK','Bad FK',$2,$3,$4,'active')`,
		uuid.New(), "bad-fk@example.test", areaA, positionB)
	if err == nil {
		t.Fatal("la FK compuesta debe impedir un cargo de otra área")
	}

	valid := helpers.SeedUser(t, pool, areaA, positionA, "active")
	var area uuid.UUID
	if err := pool.QueryRow(context.Background(), `SELECT area_id FROM users WHERE id=$1`, valid).Scan(&area); err != nil {
		t.Fatal(err)
	}
	if area != areaA {
		t.Fatalf("área incorrecta: %s", area)
	}
	_ = areaB
}
