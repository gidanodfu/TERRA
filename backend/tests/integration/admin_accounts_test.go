//go:build integration

package integration_test

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/admin"
	"terra/internal/audit"
	"terra/internal/auth"
	"terra/internal/bootstrap"
	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/organization"
	"terra/internal/platform/config"
	"terra/internal/platform/principal"
	"terra/internal/users"
	"terra/tests/helpers"
)

type accountFixture struct {
	pool         *pgxpool.Pool
	users        *users.Repository
	auth         *auth.Service
	adminHandler *admin.Handler
	userHandler  *users.Handler
	areaID       uuid.UUID
	positionID   uuid.UUID
	area2ID      uuid.UUID
	position2ID  uuid.UUID
	principalID  uuid.UUID
	adminID      uuid.UUID
	moderatorID  uuid.UUID
	readOnlyID   uuid.UUID
	workerID     uuid.UUID
	mixedID      uuid.UUID
	unknownID    uuid.UUID
}

func seedAccount(t *testing.T, pool *pgxpool.Pool, name string, roles []string,
	areaID, positionID *uuid.UUID, status string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	if _, err := pool.Exec(context.Background(), `INSERT INTO users
		(id, first_name, last_name, display_name, email, area_id, position_id, status)
		VALUES ($1,$2,'',$2,$3,$4,$5,$6)`,
		id, name, name+"@example.test", areaID, positionID, status); err != nil {
		t.Fatalf("seed account %s: %v", name, err)
	}
	for _, role := range roles {
		if _, err := pool.Exec(context.Background(), `INSERT INTO user_roles (user_id, role_id)
			SELECT $1, id FROM system_roles WHERE key = $2`, id, role); err != nil {
			t.Fatalf("seed role %s for %s: %v", role, name, err)
		}
	}
	return id
}

func newAccountFixture(t *testing.T) *accountFixture {
	t.Helper()
	pool := helpers.Pool(t)
	f := &accountFixture{pool: pool}
	f.areaID, f.positionID = helpers.SeedOrganization(t, pool, "Área Uno", "Cargo Uno")
	f.area2ID, f.position2ID = helpers.SeedOrganization(t, pool, "Área Dos", "Cargo Dos")
	f.workerID = helpers.SeedUser(t, pool, f.areaID, f.positionID, "active")
	f.principalID = seedAccount(t, pool, "Principal", []string{"admin"}, nil, nil, "active")
	f.adminID = seedAccount(t, pool, "Admin Dos", []string{"admin"}, nil, nil, "active")
	f.moderatorID = seedAccount(t, pool, "Moderador", []string{"moderator"}, nil, nil, "active")
	f.readOnlyID = seedAccount(t, pool, "Solo Lectura", []string{"read_only"}, nil, nil, "active")
	f.mixedID = seedAccount(t, pool, "Mixto", []string{"admin", "user"}, nil, nil, "active")
	f.unknownID = seedAccount(t, pool, "Desconocido", []string{"future_role"}, nil, nil, "active")

	if _, err := pool.Exec(context.Background(), `INSERT INTO bootstrap_state (id, details)
		VALUES (1, jsonb_build_object('admin_user_id', $1::text, 'admin', 'already_exists'))`,
		f.principalID.String()); err != nil {
		t.Fatalf("seed bootstrap_state: %v", err)
	}

	f.users = users.NewRepository(pool)
	orgRepo := organization.NewRepository(pool)
	auditRepo := audit.NewRepository(pool)
	adminSvc := admin.NewService(pool, f.users, orgRepo, auditRepo,
		drive.NewRepository(pool), downloads.NewRepository(pool))
	cfg := config.Config{
		Env: "development", PublicURL: "http://localhost:8080",
		SessionCookie: "terra_session", SessionTTL: time.Hour, SessionSecret: strings.Repeat("x", 32),
	}
	f.auth = auth.NewService(cfg, auth.NewRepository(pool), f.users, nil, nil, &auth.Turnstile{}, auditRepo)
	f.adminHandler = admin.NewHandler(adminSvc, "ip-secret")
	f.userHandler = users.NewHandler(users.NewService(f.users, orgRepo, auditRepo), "ip-secret")
	return f
}

func (f *accountFixture) identity(t *testing.T, id uuid.UUID) principal.Identity {
	t.Helper()
	u, err := f.users.GetByID(context.Background(), id)
	if err != nil {
		t.Fatalf("identity %s: %v", id, err)
	}
	return principal.Identity{ID: u.ID, DisplayName: u.DisplayName, Status: string(u.Status), Roles: u.Roles}
}

func (f *accountFixture) serve(t *testing.T, handler http.Handler, actor uuid.UUID,
	method, target, body string, pathValues map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set("Content-Type", "application/json")
	for key, value := range pathValues {
		req.SetPathValue(key, value)
	}
	req = req.WithContext(principal.With(req.Context(),
		principal.Principal{User: f.identity(t, actor)}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func (f *accountFixture) status(t *testing.T, id uuid.UUID) (string, *uuid.UUID) {
	t.Helper()
	var status string
	var areaID *uuid.UUID
	if err := f.pool.QueryRow(context.Background(),
		`SELECT status, area_id FROM users WHERE id = $1`, id).Scan(&status, &areaID); err != nil {
		t.Fatalf("status %s: %v", id, err)
	}
	return status, areaID
}

func (f *accountFixture) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	if err := f.pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

type userListResponse struct {
	Data       []users.User `json:"data"`
	Pagination struct {
		Total int `json:"total"`
	} `json:"pagination"`
}

func TestWorkersListExcludesAdministrativeAccounts(t *testing.T) {
	f := newAccountFixture(t)

	rec := f.serve(t, http.HandlerFunc(f.adminHandler.Users), f.adminID,
		http.MethodGet, "/api/v1/admin/users?page=1&page_size=50", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("listado: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var payload userListResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Pagination.Total != 1 {
		t.Fatalf("total de trabajadores=%d, se esperaba 1", payload.Pagination.Total)
	}
	if len(payload.Data) != 1 || payload.Data[0].ID != f.workerID {
		t.Fatalf("el listado debe contener solo al trabajador: %+v", payload.Data)
	}
	for _, excluded := range []uuid.UUID{f.principalID, f.adminID, f.moderatorID, f.readOnlyID, f.mixedID, f.unknownID} {
		for _, user := range payload.Data {
			if user.ID == excluded {
				t.Fatalf("cuenta no trabajadora filtrada: %s", excluded)
			}
		}
	}
}

func TestAdministrativeAccountsList(t *testing.T) {
	f := newAccountFixture(t)

	rec := f.serve(t, http.HandlerFunc(f.adminHandler.AdministrativeAccounts), f.adminID,
		http.MethodGet, "/api/v1/admin/accounts?page=1&page_size=50", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("cuentas administrativas: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var payload userListResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	found := map[uuid.UUID]bool{}
	for _, user := range payload.Data {
		found[user.ID] = true
	}
	for _, expected := range []uuid.UUID{f.principalID, f.adminID, f.moderatorID, f.readOnlyID, f.mixedID} {
		if !found[expected] {
			t.Fatalf("falta la cuenta administrativa %s", expected)
		}
	}
	if found[f.workerID] || found[f.unknownID] {
		t.Fatal("el listado administrativo incluyó un trabajador o un rol desconocido")
	}
}

func TestDashboardCountsOnlyWorkers(t *testing.T) {
	f := newAccountFixture(t)
	helpers.SeedUser(t, f.pool, f.areaID, f.positionID, "suspended")
	helpers.SeedUser(t, f.pool, f.areaID, f.positionID, "pending_profile")

	rec := f.serve(t, http.HandlerFunc(f.adminHandler.Dashboard), f.adminID,
		http.MethodGet, "/api/v1/admin/dashboard", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("dashboard: status=%d body=%s", rec.Code, rec.Body.String())
	}
	var dashboard admin.Dashboard
	if err := json.Unmarshal(rec.Body.Bytes(), &dashboard); err != nil {
		t.Fatal(err)
	}
	if dashboard.ActiveUsers != 1 || dashboard.PendingProfiles != 1 || dashboard.SuspendedUsers != 1 {
		t.Fatalf("contadores de trabajadores: activos=%d pendientes=%d suspendidos=%d",
			dashboard.ActiveUsers, dashboard.PendingProfiles, dashboard.SuspendedUsers)
	}
}

func TestWorkerDetailRejectsAdministrativeAccounts(t *testing.T) {
	f := newAccountFixture(t)

	ok := f.serve(t, http.HandlerFunc(f.adminHandler.User), f.adminID,
		http.MethodGet, "/api/v1/admin/users/"+f.workerID.String(), "", map[string]string{"id": f.workerID.String()})
	if ok.Code != http.StatusOK {
		t.Fatalf("detalle de trabajador: status=%d body=%s", ok.Code, ok.Body.String())
	}
	for _, id := range []uuid.UUID{f.principalID, f.adminID, f.moderatorID, f.readOnlyID, f.mixedID} {
		rec := f.serve(t, http.HandlerFunc(f.adminHandler.User), f.adminID,
			http.MethodGet, "/api/v1/admin/users/"+id.String(), "", map[string]string{"id": id.String()})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("detalle administrativo %s: status=%d body=%s", id, rec.Code, rec.Body.String())
		}
	}
}

func TestAdminUpdatesWorkerAndInvalidatesSessions(t *testing.T) {
	f := newAccountFixture(t)
	hash := sha256.Sum256([]byte("worker-session"))
	if _, err := auth.NewRepository(f.pool).CreateSession(context.Background(), f.workerID, hash[:],
		"csrf", time.Now().Add(time.Hour), "integration-test", "ip-hash"); err != nil {
		t.Fatal(err)
	}

	body := fmt.Sprintf(`{"area_id":%q,"position_id":%q,"status":"suspended"}`,
		f.area2ID.String(), f.position2ID.String())
	rec := f.serve(t, http.HandlerFunc(f.adminHandler.UpdateUser), f.adminID,
		http.MethodPatch, "/api/v1/admin/users/"+f.workerID.String(), body,
		map[string]string{"id": f.workerID.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("actualización de trabajador: status=%d body=%s", rec.Code, rec.Body.String())
	}
	status, areaID := f.status(t, f.workerID)
	if status != "suspended" || areaID == nil || *areaID != f.area2ID {
		t.Fatalf("trabajador no actualizado: status=%s area=%v", status, areaID)
	}
	if sessions := f.count(t, `SELECT count(*) FROM sessions WHERE user_id=$1`, f.workerID); sessions != 0 {
		t.Fatalf("sesiones del trabajador no invalidadas: %d", sessions)
	}
	if events := f.count(t, `SELECT count(*) FROM audit_events
		WHERE action='admin.user.updated' AND target_id=$1`, f.workerID.String()); events != 1 {
		t.Fatalf("eventos de auditoría del trabajador=%d", events)
	}
}

func TestWorkerEndpointsRejectAdministrativeTargets(t *testing.T) {
	f := newAccountFixture(t)
	body := fmt.Sprintf(`{"area_id":%q,"position_id":%q,"status":"disabled"}`,
		f.areaID.String(), f.positionID.String())
	for _, id := range []uuid.UUID{f.principalID, f.adminID, f.moderatorID, f.readOnlyID, f.mixedID} {
		rec := f.serve(t, http.HandlerFunc(f.adminHandler.UpdateUser), f.adminID,
			http.MethodPatch, "/api/v1/admin/users/"+id.String(), body,
			map[string]string{"id": id.String()})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("actualización administrativa %s: status=%d body=%s", id, rec.Code, rec.Body.String())
		}
	}
	if status, _ := f.status(t, f.principalID); status != "active" {
		t.Fatalf("el administrador principal cambió de estado: %s", status)
	}
}

func TestAdministrativeProfileCannotAssignOrganization(t *testing.T) {
	f := newAccountFixture(t)
	body := fmt.Sprintf(`{"first_name":"Cuenta","last_name":"Admin","area_id":%q,"position_id":%q}`,
		f.areaID.String(), f.positionID.String())

	for _, id := range []uuid.UUID{f.adminID, f.principalID, f.moderatorID, f.readOnlyID} {
		rec := f.serve(t, http.HandlerFunc(f.userHandler.UpdateProfile), id,
			http.MethodPatch, "/api/v1/me/profile", body, nil)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("perfil administrativo %s: status=%d body=%s", id, rec.Code, rec.Body.String())
		}
		_, areaID := f.status(t, id)
		if areaID != nil {
			t.Fatalf("la cuenta administrativa %s recibió área %s", id, *areaID)
		}
	}

	workerBody := fmt.Sprintf(`{"first_name":"Tra","last_name":"Bajador","area_id":%q,"position_id":%q}`,
		f.area2ID.String(), f.position2ID.String())
	rec := f.serve(t, http.HandlerFunc(f.userHandler.UpdateProfile), f.workerID,
		http.MethodPatch, "/api/v1/me/profile", workerBody, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("perfil de trabajador: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestWorkerCannotCallAdministrativeEndpoints(t *testing.T) {
	f := newAccountFixture(t)
	guarded := f.auth.RequireAdmin(http.HandlerFunc(f.adminHandler.UpdateUser))
	body := fmt.Sprintf(`{"area_id":%q,"position_id":%q,"status":"active"}`,
		f.areaID.String(), f.positionID.String())
	rec := f.serve(t, guarded, f.workerID, http.MethodPatch,
		"/api/v1/admin/users/"+f.workerID.String(), body, map[string]string{"id": f.workerID.String()})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("trabajador en endpoint administrativo: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAdministrativeStatusAuthorization(t *testing.T) {
	f := newAccountFixture(t)
	guarded := f.auth.RequireAdmin(http.HandlerFunc(f.adminHandler.UpdateAdministrativeAccount))
	body := `{"status":"disabled"}`

	for _, actor := range []uuid.UUID{f.moderatorID, f.readOnlyID, f.workerID} {
		rec := f.serve(t, guarded, actor, http.MethodPatch,
			"/api/v1/admin/accounts/"+f.moderatorID.String(), body,
			map[string]string{"id": f.moderatorID.String()})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("actor %s desactivó una cuenta: status=%d body=%s", actor, rec.Code, rec.Body.String())
		}
	}
	if status, _ := f.status(t, f.moderatorID); status != "active" {
		t.Fatalf("el moderador cambió de estado: %s", status)
	}
}

func TestAdminCanDisableFutureAdministrativeAccount(t *testing.T) {
	f := newAccountFixture(t)
	hash := sha256.Sum256([]byte("moderator-session"))
	if _, err := auth.NewRepository(f.pool).CreateSession(context.Background(), f.moderatorID, hash[:],
		"csrf", time.Now().Add(time.Hour), "integration-test", "ip-hash"); err != nil {
		t.Fatal(err)
	}

	rec := f.serve(t, http.HandlerFunc(f.adminHandler.UpdateAdministrativeAccount), f.adminID,
		http.MethodPatch, "/api/v1/admin/accounts/"+f.moderatorID.String(), `{"status":"disabled"}`,
		map[string]string{"id": f.moderatorID.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("desactivación de moderador: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if status, _ := f.status(t, f.moderatorID); status != "disabled" {
		t.Fatalf("moderador no desactivado: %s", status)
	}
	if sessions := f.count(t, `SELECT count(*) FROM sessions WHERE user_id=$1`, f.moderatorID); sessions != 0 {
		t.Fatalf("sesiones del moderador no invalidadas: %d", sessions)
	}
	if events := f.count(t, `SELECT count(*) FROM audit_events
		WHERE action='admin.account.disabled' AND target_id=$1`, f.moderatorID.String()); events != 1 {
		t.Fatalf("eventos de desactivación=%d", events)
	}

	rec = f.serve(t, http.HandlerFunc(f.adminHandler.UpdateAdministrativeAccount), f.adminID,
		http.MethodPatch, "/api/v1/admin/accounts/"+f.moderatorID.String(), `{"status":"active"}`,
		map[string]string{"id": f.moderatorID.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("reactivación de moderador: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if status, _ := f.status(t, f.moderatorID); status != "active" {
		t.Fatalf("moderador no reactivado: %s", status)
	}
}

func TestPrincipalAdministratorCannotBeDisabled(t *testing.T) {
	f := newAccountFixture(t)

	rec := f.serve(t, http.HandlerFunc(f.adminHandler.UpdateAdministrativeAccount), f.adminID,
		http.MethodPatch, "/api/v1/admin/accounts/"+f.principalID.String(), `{"status":"disabled"}`,
		map[string]string{"id": f.principalID.String()})
	if rec.Code != http.StatusConflict {
		t.Fatalf("desactivación del principal: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if status, _ := f.status(t, f.principalID); status != "active" {
		t.Fatalf("el administrador principal cambió de estado: %s", status)
	}
	if events := f.count(t, `SELECT count(*) FROM audit_events
		WHERE action='admin.account.status_rejected' AND target_id=$1`, f.principalID.String()); events != 1 {
		t.Fatalf("eventos de rechazo del principal=%d", events)
	}

	// Nadie puede desactivar su propia cuenta administrativa.
	rec = f.serve(t, http.HandlerFunc(f.adminHandler.UpdateAdministrativeAccount), f.adminID,
		http.MethodPatch, "/api/v1/admin/accounts/"+f.adminID.String(), `{"status":"disabled"}`,
		map[string]string{"id": f.adminID.String()})
	if rec.Code != http.StatusConflict {
		t.Fatalf("auto-desactivación: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAdministrativeDisableFailsClosedWithoutPrincipal(t *testing.T) {
	f := newAccountFixture(t)
	if _, err := f.pool.Exec(context.Background(), `UPDATE bootstrap_state SET details='{}'::jsonb WHERE id=1`); err != nil {
		t.Fatal(err)
	}

	rec := f.serve(t, http.HandlerFunc(f.adminHandler.UpdateAdministrativeAccount), f.adminID,
		http.MethodPatch, "/api/v1/admin/accounts/"+f.moderatorID.String(), `{"status":"disabled"}`,
		map[string]string{"id": f.moderatorID.String()})
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("principal sin resolver: status=%d body=%s", rec.Code, rec.Body.String())
	}
	if status, _ := f.status(t, f.moderatorID); status != "active" {
		t.Fatalf("la cuenta se desactivó sin principal resuelto: %s", status)
	}
}

func TestBootstrapRecoversPrincipalIdentifierWithoutReplacingIt(t *testing.T) {
	f := newAccountFixture(t)
	pool := f.pool

	// La credencial de bootstrap ya existe y posee el rol admin.
	if _, err := pool.Exec(context.Background(), `INSERT INTO local_credentials
		(user_id, username, password_hash, must_rotate_password) VALUES ($1,'bootstrap-admin','hash',false)`,
		f.principalID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `UPDATE bootstrap_state SET details='{"admin":"already_exists"}'::jsonb WHERE id=1`); err != nil {
		t.Fatal(err)
	}
	if err := bootstrap.EnsureExistingPrincipal(context.Background(), pool, "bootstrap-admin", nil); err != nil {
		t.Fatal(err)
	}
	var raw string
	if err := pool.QueryRow(context.Background(),
		`SELECT details->>'admin_user_id' FROM bootstrap_state WHERE id=1`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if raw != f.principalID.String() {
		t.Fatalf("admin_user_id=%q, se esperaba %s", raw, f.principalID)
	}

	// Un identificador existente nunca se reemplaza, ni siquiera si apunta a otra cuenta.
	other := seedAccount(t, pool, "Otro Admin", []string{"admin"}, nil, nil, "active")
	if _, err := pool.Exec(context.Background(), `UPDATE bootstrap_state
		SET details=jsonb_build_object('admin_user_id',$1::text) WHERE id=1`, other.String()); err != nil {
		t.Fatal(err)
	}
	if err := bootstrap.EnsureExistingPrincipal(context.Background(), pool, "bootstrap-admin", nil); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(),
		`SELECT details->>'admin_user_id' FROM bootstrap_state WHERE id=1`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	if raw != other.String() {
		t.Fatalf("el identificador existente fue reemplazado: %q", raw)
	}
}

func TestBootstrapDoesNotRecordNonAdminCredential(t *testing.T) {
	f := newAccountFixture(t)
	pool := f.pool
	if _, err := pool.Exec(context.Background(), `DELETE FROM bootstrap_state WHERE id=1`); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO local_credentials
		(user_id, username, password_hash) VALUES ($1,'worker-bootstrap','hash')`, f.workerID); err != nil {
		t.Fatal(err)
	}
	if err := bootstrap.EnsureExistingPrincipal(context.Background(), pool, "worker-bootstrap", nil); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM bootstrap_state`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("se registró un principal sin rol admin: %d filas", count)
	}
}
