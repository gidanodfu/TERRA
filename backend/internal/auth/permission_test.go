package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"terra/internal/platform/principal"
)

func TestRequireAnyPermission(t *testing.T) {
	svc := &Service{}
	handler := svc.RequireAnyPermission("admin.audit.read", "admin.audit.operational.read")(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))

	cases := []struct {
		name       string
		identity   *principal.Identity
		wantStatus int
	}{
		{"sin sesión", nil, http.StatusUnauthorized},
		{"auditoría completa", &principal.Identity{Status: "active", Permissions: []string{"admin.audit.read"}}, http.StatusNoContent},
		{"auditoría operacional", &principal.Identity{Status: "active", Permissions: []string{"admin.audit.operational.read"}}, http.StatusNoContent},
		{"sin permiso", &principal.Identity{Status: "active", Permissions: []string{"admin.users.read"}}, http.StatusForbidden},
		{"cuenta inactiva", &principal.Identity{Status: "suspended", Permissions: []string{"admin.audit.read"}}, http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/audit-events", nil)
			if tc.identity != nil {
				req = req.WithContext(principal.With(req.Context(), principal.Principal{User: *tc.identity}))
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus {
				t.Fatalf("status=%d, se esperaba %d", rec.Code, tc.wantStatus)
			}
		})
	}
}
