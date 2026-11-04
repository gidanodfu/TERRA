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
	if !contains(admin, "admin.users.write") || contains(admin, "me.profile.write") {
		t.Fatalf("permisos de administrador incorrectos: %v", admin)
	}

	mixed := PermissionsFor([]string{"admin", "user"})
	if !contains(mixed, "admin.users.write") || contains(mixed, "me.profile.write") {
		t.Fatalf("una cuenta mixta no debe recibir permisos de trabajador: %v", mixed)
	}

	for _, role := range []string{"moderator", "read_only", "future_role"} {
		if permissions := PermissionsFor([]string{role}); len(permissions) != 0 {
			t.Fatalf("el rol %s recibió permisos automáticos: %v", role, permissions)
		}
	}
}
