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
	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/organization"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/platform/rbac"
)

type errorPayload struct {
	Error struct {
		Code    string            `json:"code"`
		Message string            `json:"message"`
		Fields  map[string]string `json:"fields"`
	} `json:"error"`
}

func decodeError(t *testing.T, body []byte) errorPayload {
	t.Helper()
	var payload errorPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("respuesta de error inválida: %v (%s)", err, body)
	}
	return payload
}

func assertInvalidField(t *testing.T, err error, field string) {
	t.Helper()
	if err == nil {
		t.Fatalf("se esperaba validation_error en %s", field)
	}
	e := apperr.As(err)
	if e.Status != http.StatusUnprocessableEntity || e.Code != "validation_error" {
		t.Fatalf("error inesperado: status=%d code=%s message=%s", e.Status, e.Code, e.Message)
	}
	if e.Fields[field] == "" {
		t.Fatalf("falta el campo %s: %+v", field, e.Fields)
	}
}

// TestBypassWriteValidations llama a los handlers sin React ni validación de
// navegador y comprueba que el servidor conserva las reglas de negocio.
func TestBypassWriteValidations(t *testing.T) {
	f := newAccountFixture(t)
	orgRepo := organization.NewRepository(f.pool)
	orgSvc := organization.NewService(orgRepo, audit.NewRepository(f.pool))
	orgHandler := organization.NewHandler(orgSvc, "ip-secret")

	t.Run("área sin nombre", func(t *testing.T) {
		rec := f.serve(t, http.HandlerFunc(orgHandler.CreateArea), f.adminID,
			http.MethodPost, "/api/v1/admin/areas", `{"name":"   "}`, nil)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		if decodeError(t, rec.Body.Bytes()).Error.Fields["name"] == "" {
			t.Fatal("falta el error por campo name")
		}
	})

	t.Run("área duplicada", func(t *testing.T) {
		body := `{"name":"Salud Pública"}`
		if rec := f.serve(t, http.HandlerFunc(orgHandler.CreateArea), f.adminID,
			http.MethodPost, "/api/v1/admin/areas", body, nil); rec.Code != http.StatusCreated {
			t.Fatalf("crear área: status=%d body=%s", rec.Code, rec.Body.String())
		}
		rec := f.serve(t, http.HandlerFunc(orgHandler.CreateArea), f.adminID,
			http.MethodPost, "/api/v1/admin/areas", body, nil)
		if rec.Code != http.StatusConflict || decodeError(t, rec.Body.Bytes()).Error.Code != "area_exists" {
			t.Fatalf("duplicado: status=%d body=%s", rec.Code, rec.Body.String())
		}
		if f.count(t, `SELECT count(*) FROM areas WHERE name='Salud Pública'`) != 1 {
			t.Fatal("el área duplicada se persistió")
		}
	})

	t.Run("estado organizativo inválido", func(t *testing.T) {
		var areaID uuid.UUID
		if err := f.pool.QueryRow(context.Background(),
			`SELECT id FROM areas WHERE name='Salud Pública'`).Scan(&areaID); err != nil {
			t.Fatal(err)
		}
		rec := f.serve(t, http.HandlerFunc(orgHandler.UpdateArea), f.adminID,
			http.MethodPatch, "/api/v1/admin/areas/"+areaID.String(), `{"status":"deleted"}`,
			map[string]string{"id": areaID.String()})
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		if decodeError(t, rec.Body.Bytes()).Error.Fields["status"] == "" {
			t.Fatal("falta el error por campo status")
		}
	})

	t.Run("rol administrativo inválido", func(t *testing.T) {
		password := "ClaveSegura-12345"
		rec, _ := f.createAccount(t, f.adminID,
			accountCreateBody(rbac.RoleUser, "Rol", "Inválido", "rol-invalido", password, password))
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		if decodeError(t, rec.Body.Bytes()).Error.Fields["role"] == "" {
			t.Fatal("falta el error por campo role")
		}
		if f.count(t, `SELECT count(*) FROM local_credentials WHERE username='rol-invalido'`) != 0 {
			t.Fatal("la cuenta con rol inválido se persistió")
		}
	})

	t.Run("username duplicado", func(t *testing.T) {
		password := "ClaveSegura-12345"
		if rec, _ := f.createAccount(t, f.adminID,
			accountCreateBody(rbac.RoleModerator, "Cuenta", "Uno", "duplicado", password, password)); rec.Code != http.StatusCreated {
			t.Fatalf("crear cuenta: status=%d body=%s", rec.Code, rec.Body.String())
		}
		rec, _ := f.createAccount(t, f.adminID,
			accountCreateBody(rbac.RoleModerator, "Cuenta", "Dos", "duplicado", password, password))
		if rec.Code != http.StatusConflict || decodeError(t, rec.Body.Bytes()).Error.Code != "username_taken" {
			t.Fatalf("duplicado: status=%d body=%s", rec.Code, rec.Body.String())
		}
	})

	t.Run("trabajador modificado sin permiso", func(t *testing.T) {
		rec := f.serve(t, http.HandlerFunc(f.adminHandler.UpdateUser), f.readOnlyID,
			http.MethodPatch, "/api/v1/admin/users/"+f.workerID.String(),
			`{"status":"suspended"}`, map[string]string{"id": f.workerID.String()})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
		}
		if status, _ := f.status(t, f.workerID); status != "active" {
			t.Fatalf("el trabajador cambió de estado: %s", status)
		}
	})

	t.Run("selección de descarga fuera de límites", func(t *testing.T) {
		svc := downloads.NewService(config.Config{}, nil, nil, nil, nil, nil)
		_, _, err := svc.Create(context.Background(), f.adminID, f.workerID, downloads.CreateInput{
			ScopeType: downloads.ScopeSelectedFolders, RootFolderIDs: make([]string, 101),
		}, "validation-key", "ip")
		assertInvalidField(t, err, "root_folder_ids")

		_, _, err = svc.Create(context.Background(), f.adminID, f.workerID, downloads.CreateInput{
			ScopeType: downloads.ScopeSelectedItems, RootFileIDs: []string{strings.Repeat("a", 257)},
		}, "validation-key", "ip")
		assertInvalidField(t, err, "root_file_ids")
	})

	t.Run("política vacía", func(t *testing.T) {
		driveSvc := drive.NewService(config.Config{}, drive.NewRepository(f.pool), f.users,
			nil, nil, nil, nil, audit.NewRepository(f.pool))
		_, err := driveSvc.CreatePolicy(context.Background(), f.adminID, "   ", "contenido", "ip")
		assertInvalidField(t, err, "version")
		_, err = driveSvc.CreatePolicy(context.Background(), f.adminID, "2026-01", "   ", "ip")
		assertInvalidField(t, err, "content")
		_, err = driveSvc.AcceptPolicy(context.Background(), f.workerID, "  ", "ip")
		assertInvalidField(t, err, "version")
	})

	t.Run("cambio de contraseña sin contraseña actual", func(t *testing.T) {
		userID, _, _ := createRoleAccountForPasswordTest(t, f, rbac.RoleReadOnly)
		err := f.auth.ChangePassword(context.Background(), userID, "", "", "NuevaSegura-456", "ip")
		assertInvalidField(t, err, "current_password")
	})
}
