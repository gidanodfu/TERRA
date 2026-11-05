//go:build integration

package integration_test

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"terra/internal/auth"
	"terra/internal/platform/password"
	"terra/internal/platform/principal"
	"terra/internal/platform/rbac"
)

func createRoleAccountForPasswordTest(t *testing.T, f *accountFixture, role string) (uuid.UUID, string, string) {
	t.Helper()
	username := fmt.Sprintf("pw-%s-%s", role, uuid.NewString()[:8])
	initial := "InicialSegura-123"
	rec, account := f.createAccount(t, f.adminID,
		accountCreateBody(role, "Password", role, username, initial, initial))
	if rec.Code != http.StatusCreated {
		t.Fatalf("crear cuenta %s: status=%d body=%s", role, rec.Code, rec.Body.String())
	}
	return account.ID, username, initial
}

func createSessionForTest(t *testing.T, f *accountFixture, userID uuid.UUID, rawToken, csrf string) {
	t.Helper()
	hash := sha256.Sum256([]byte(rawToken))
	if _, err := auth.NewRepository(f.pool).CreateSession(context.Background(), userID, hash[:], csrf,
		time.Now().Add(time.Hour), "integration-test", "ip-hash"); err != nil {
		t.Fatalf("crear sesión %s: %v", rawToken, err)
	}
}

func TestAdministrativePasswordChangeForAllRoles(t *testing.T) {
	f := newAccountFixture(t)
	for _, role := range []string{rbac.RoleAdmin, rbac.RoleModerator, rbac.RoleReadOnly} {
		t.Run(role, func(t *testing.T) {
			userID, _, initial := createRoleAccountForPasswordTest(t, f, role)
			currentToken := "current-" + role
			otherToken := "other-" + role
			createSessionForTest(t, f, userID, currentToken, "csrf-current-"+role)
			createSessionForTest(t, f, userID, otherToken, "csrf-other-"+role)

			next := "NuevaSegura-456"
			if err := f.auth.ChangePassword(context.Background(), userID, currentToken, initial, next, "ip-hash"); err != nil {
				t.Fatalf("cambiar contraseña %s: %v", role, err)
			}

			cred, err := auth.NewRepository(f.pool).GetLocalCredentialByUserID(context.Background(), userID)
			if err != nil {
				t.Fatal(err)
			}
			if password.Verify(cred.PasswordHash, initial) {
				t.Fatalf("%s: la contraseña anterior sigue siendo válida", role)
			}
			if !password.Verify(cred.PasswordHash, next) {
				t.Fatalf("%s: la contraseña nueva no es válida", role)
			}
			if cred.MustRotatePassword {
				t.Fatalf("%s: must_rotate_password no se desactivó", role)
			}

			currentHash := sha256.Sum256([]byte(currentToken))
			otherHash := sha256.Sum256([]byte(otherToken))
			if _, err := auth.NewRepository(f.pool).GetSession(context.Background(), currentHash[:]); err != nil {
				t.Fatalf("%s: la sesión actual no permanece operativa: %v", role, err)
			}
			if _, err := auth.NewRepository(f.pool).GetSession(context.Background(), otherHash[:]); err == nil {
				t.Fatalf("%s: la otra sesión no fue invalidada", role)
			}

			currentUser, err := f.users.GetByID(context.Background(), userID)
			if err != nil {
				t.Fatal(err)
			}
			profile, err := f.auth.Me(context.Background(), principal.Identity{
				ID: currentUser.ID, Roles: currentUser.Roles,
			})
			if err != nil {
				t.Fatal(err)
			}
			if profile["has_local_credentials"] != true {
				t.Fatalf("%s: has_local_credentials debería seguir siendo true", role)
			}
			if profile["must_rotate_password"] != false {
				t.Fatalf("%s: must_rotate_password debería ser false", role)
			}
			permissions, _ := profile["permissions"].([]string)
			if len(permissions) == 0 || !rbac.HasPermission(currentUser.Roles, rbac.PermDashboardRead) {
				t.Fatalf("%s: la cuenta perdió sus permisos: %v", role, permissions)
			}
			if len(currentUser.Roles) != 1 || currentUser.Roles[0] != role {
				t.Fatalf("%s: los roles cambiaron: %v", role, currentUser.Roles)
			}

			guarded := f.auth.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
			req.AddCookie(&http.Cookie{Name: f.cfg.SessionCookie, Value: currentToken})
			rec := httptest.NewRecorder()
			guarded.ServeHTTP(rec, req)
			if rec.Code != http.StatusNoContent {
				t.Fatalf("%s: la sesión actual no autentica: status=%d", role, rec.Code)
			}
		})
	}
}

func TestAdministrativePasswordChangeRejectsInvalidValues(t *testing.T) {
	f := newAccountFixture(t)
	userID, _, initial := createRoleAccountForPasswordTest(t, f, rbac.RoleModerator)
	token := "invalid-password-session"
	createSessionForTest(t, f, userID, token, "csrf-invalid")

	cases := []struct {
		name    string
		current string
		next    string
	}{
		{"contraseña actual incorrecta", "Incorrecta-123", "NuevaSegura-456"},
		{"contraseña débil", initial, "corta"},
		{"contraseña igual", initial, initial},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := f.auth.ChangePassword(context.Background(), userID, token, tc.current, tc.next, "ip-hash"); err == nil {
				t.Fatal("se aceptó un cambio inválido")
			}
		})
	}
	if f.auth.ChangePassword(context.Background(), userID, token, initial, "NuevaSegura-456", "ip-hash") != nil {
		t.Fatal("la contraseña válida no pudo cambiarse después de los rechazos")
	}
}

func TestMeWithoutLocalCredentials(t *testing.T) {
	f := newAccountFixture(t)
	worker, err := f.users.GetByID(context.Background(), f.workerID)
	if err != nil {
		t.Fatal(err)
	}
	profile, err := f.auth.Me(context.Background(), principal.Identity{ID: worker.ID, Roles: worker.Roles})
	if err != nil {
		t.Fatal(err)
	}
	if profile["has_local_credentials"] != false {
		t.Fatal("un trabajador sin credenciales locales recibió has_local_credentials=true")
	}
	if profile["must_rotate_password"] != false {
		t.Fatal("un trabajador sin credenciales locales recibió must_rotate_password=true")
	}
}
