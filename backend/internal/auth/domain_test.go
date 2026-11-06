package auth

import (
	"slices"
	"testing"
)

func TestPermissionsForExactRoleSets(t *testing.T) {
	cases := []struct {
		roles []string
		want  []string
	}{
		{[]string{"admin"}, []string{
			"admin.dashboard.read", "admin.users.read", "admin.users.write",
			"admin.accounts.read", "admin.accounts.create", "admin.accounts.write",
			"admin.organization.read", "admin.organization.write", "admin.drive.read",
			"admin.drive.browse", "admin.jobs.read", "admin.jobs.create", "admin.jobs.cancel",
			"admin.jobs.retry", "admin.storage.read", "admin.audit.read", "admin.policy.write",
			"admin.files.read",
		}},
		{[]string{"moderator"}, []string{
			"admin.dashboard.read", "admin.users.read", "admin.users.write",
			"admin.organization.read", "admin.drive.read", "admin.jobs.read",
			"admin.audit.operational.read",
		}},
		{[]string{"read_only"}, []string{
			"admin.dashboard.read", "admin.users.read", "admin.organization.read",
			"admin.drive.read", "admin.jobs.read", "admin.storage.read", "admin.audit.read",
		}},
		{[]string{"user"}, []string{
			"me.read", "me.profile.write", "me.drive.read", "me.drive.connect",
			"me.drive.disconnect", "me.jobs.read", "me.files.read", "me.policy.accept",
		}},
		{[]string{"admin", "moderator"}, nil},
		{[]string{"future_role"}, nil},
	}
	for _, tc := range cases {
		got := PermissionsFor(tc.roles)
		if !slices.Equal(got, tc.want) {
			t.Fatalf("roles %v: permisos=%v, se esperaba %v", tc.roles, got, tc.want)
		}
	}

	mixed := PermissionsFor([]string{"admin", "user"})
	if !slices.Equal(mixed, PermissionsFor([]string{"admin"})) {
		t.Fatalf("una cuenta admin+user debe conservar solo el perfil administrativo: %v", mixed)
	}
	if slices.Contains(mixed, "me.profile.write") {
		t.Fatalf("la cuenta mixta recibió permisos de trabajador: %v", mixed)
	}

	admin := PermissionsFor([]string{"admin"})
	if !slices.Contains(admin, "admin.audit.read") || slices.Contains(admin, "admin.audit.operational.read") {
		t.Fatalf("el administrador debe tener auditoría completa y no la operacional: %v", admin)
	}
	moderator := PermissionsFor([]string{"moderator"})
	if slices.Contains(moderator, "admin.audit.read") || !slices.Contains(moderator, "admin.audit.operational.read") {
		t.Fatalf("el moderador debe tener solo auditoría operacional: %v", moderator)
	}
	if slices.Contains(moderator, "admin.accounts.read") || slices.Contains(moderator, "admin.accounts.create") {
		t.Fatalf("el moderador no debe administrar cuentas: %v", moderator)
	}
	readOnly := PermissionsFor([]string{"read_only"})
	if !slices.Contains(readOnly, "admin.audit.read") || slices.Contains(readOnly, "admin.audit.operational.read") {
		t.Fatalf("solo lectura debe conservar auditoría completa: %v", readOnly)
	}

	// Cada llamada devuelve una copia: mutar el resultado no altera la matriz.
	first := PermissionsFor([]string{"admin"})
	first[0] = "mutated"
	if PermissionsFor([]string{"admin"})[0] == "mutated" {
		t.Fatal("PermissionsFor comparte la slice interna")
	}
}
