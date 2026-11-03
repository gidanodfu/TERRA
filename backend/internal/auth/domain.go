// Package auth implements worker Google sign-in, local administrator sign-in,
// server-side sessions, CSRF protection and route authorization.
package auth

import (
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	CSRFToken string
	ExpiresAt time.Time
}

type OAuthState struct {
	ID            uuid.UUID
	Flow          string
	UserID        *uuid.UUID
	CodeVerifier  string
	Nonce         string
	RedirectAfter string
}

type LocalCredential struct {
	UserID             uuid.UUID
	Username           string
	PasswordHash       string
	UserStatus         string
	MustRotatePassword bool
}

const (
	FlowLogin        = "login"
	FlowDriveConnect = "drive_connect"
)

var userPermissions = []string{
	"me.read", "me.profile.write", "me.drive.read", "me.drive.connect", "me.drive.disconnect",
	"me.jobs.read", "me.files.read", "me.policy.accept",
}

var adminPermissions = []string{
	"admin.dashboard.read", "admin.users.read", "admin.users.write",
	"admin.organization.read", "admin.organization.write",
	"admin.drive.read", "admin.jobs.read", "admin.jobs.create", "admin.jobs.cancel", "admin.jobs.retry",
	"admin.storage.read", "admin.audit.read", "admin.files.read",
}

func PermissionsFor(roles []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, r := range roles {
		switch r {
		case "admin":
			for _, p := range adminPermissions {
				if !seen[p] {
					seen[p] = true
					out = append(out, p)
				}
			}
		case "user":
			for _, p := range userPermissions {
				if !seen[p] {
					seen[p] = true
					out = append(out, p)
				}
			}
		}
	}
	return out
}
