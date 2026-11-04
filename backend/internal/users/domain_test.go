package users

import "testing"

func TestAccountClassification(t *testing.T) {
	cases := []struct {
		name     string
		roles    []string
		worker   bool
		adminAcc bool
	}{
		{"worker", []string{"user"}, true, false},
		{"admin", []string{"admin"}, false, true},
		{"moderator", []string{"moderator"}, false, true},
		{"read only", []string{"read_only"}, false, true},
		{"mixed admin worker", []string{"admin", "user"}, false, true},
		{"mixed moderator worker", []string{"moderator", "user"}, false, true},
		{"unknown", []string{"future_role"}, false, false},
		{"mixed unknown worker", []string{"future_role", "user"}, false, false},
		{"no roles", nil, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			user := User{Roles: tc.roles}
			if got := user.IsWorker(); got != tc.worker {
				t.Fatalf("IsWorker()=%v, se esperaba %v", got, tc.worker)
			}
			if got := user.IsAdministrative(); got != tc.adminAcc {
				t.Fatalf("IsAdministrative()=%v, se esperaba %v", got, tc.adminAcc)
			}
		})
	}
}
