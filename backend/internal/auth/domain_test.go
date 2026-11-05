package auth

import "testing"

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func TestPermissionsForAccountClassification(t *testing.T) {
	worker := PermissionsFor([]string{"user"})
	if !contains(worker, "me.profile.write") || contains(worker, "admin.users.write") {
		t.Fatalf("permisos de trabajador incorrectos: %v", worker)
	}

	admin := PermissionsFor([]string{"admin"})
	for _, permission := range []string{
		"admin.dashboard.read", "admin.users.read", "admin.users.write",
		"admin.accounts.read", "admin.accounts.create", "admin.accounts.write",
		"admin.organization.read", "admin.organization.write", "admin.drive.read",
		"admin.drive.browse", "admin.jobs.read", "admin.jobs.create", "admin.jobs.cancel",
		"admin.jobs.retry", "admin.storage.read", "admin.audit.read", "admin.policy.write",
		"admin.files.read",
	} {
		if !contains(admin, permission) {
			t.Fatalf("al administrador le falta %s: %v", permission, admin)
		}
	}
	if contains(admin, "me.profile.write") {
		t.Fatalf("el administrador no debe recibir permisos de trabajador: %v", admin)
	}

	moderator := PermissionsFor([]string{"moderator"})
	for _, permission := range []string{
		"admin.dashboard.read", "admin.users.read", "admin.users.write",
		"admin.organization.read", "admin.drive.read", "admin.jobs.read",
	} {
		if !contains(moderator, permission) {
			t.Fatalf("al moderador le falta %s: %v", permission, moderator)
		}
	}
	for _, forbidden := range []string{
		"admin.accounts.read", "admin.accounts.create", "admin.accounts.write",
		"admin.organization.write", "admin.drive.browse", "admin.jobs.create",
		"admin.jobs.cancel", "admin.jobs.retry", "admin.storage.read", "admin.audit.read",
		"admin.policy.write", "admin.files.read",
	} {
		if contains(moderator, forbidden) {
			t.Fatalf("el moderador no debe recibir %s: %v", forbidden, moderator)
		}
	}

	readOnly := PermissionsFor([]string{"read_only"})
	for _, permission := range []string{
		"admin.dashboard.read", "admin.users.read", "admin.organization.read",
		"admin.drive.read", "admin.jobs.read", "admin.storage.read", "admin.audit.read",
	} {
		if !contains(readOnly, permission) {
			t.Fatalf("a solo lectura le falta %s: %v", permission, readOnly)
		}
	}
	for _, forbidden := range []string{
		"admin.users.write", "admin.accounts.read", "admin.accounts.create",
		"admin.accounts.write", "admin.organization.write", "admin.drive.browse",
		"admin.jobs.create", "admin.jobs.cancel", "admin.jobs.retry", "admin.policy.write",
		"admin.files.read",
	} {
		if contains(readOnly, forbidden) {
			t.Fatalf("solo lectura no debe recibir %s: %v", forbidden, readOnly)
		}
	}

	mixed := PermissionsFor([]string{"admin", "user"})
	if !contains(mixed, "admin.users.write") || contains(mixed, "me.profile.write") {
		t.Fatalf("una cuenta mixta no debe recibir permisos de trabajador: %v", mixed)
	}
	if permissions := PermissionsFor([]string{"admin", "moderator"}); len(permissions) != 0 {
		t.Fatalf("dos roles administrativos deben denegar permisos: %v", permissions)
	}
	if permissions := PermissionsFor([]string{"future_role"}); len(permissions) != 0 {
		t.Fatalf("un rol desconocido recibió permisos: %v", permissions)
	}
}
