// Package users owns TERRA worker profiles and their organizational assignment.
package users

import (
	"time"

	"github.com/google/uuid"
)

type Status string

const (
	StatusPendingProfile Status = "pending_profile"
	StatusActive         Status = "active"
	StatusSuspended      Status = "suspended"
	StatusDisabled       Status = "disabled"
)

type Role string

const (
	RoleAdmin     Role = "admin"
	RoleModerator Role = "moderator"
	RoleReadOnly  Role = "read_only"
	RoleUser      Role = "user"
)

type User struct {
	ID           uuid.UUID  `json:"id"`
	FirstName    string     `json:"first_name"`
	LastName     string     `json:"last_name"`
	DisplayName  string     `json:"display_name"`
	Email        string     `json:"email,omitempty"`
	AreaID       *uuid.UUID `json:"area_id,omitempty"`
	AreaName     string     `json:"area_name,omitempty"`
	AreaSlug     string     `json:"-"`
	PositionID   *uuid.UUID `json:"position_id,omitempty"`
	PositionName string     `json:"position_name,omitempty"`
	PositionSlug string     `json:"-"`
	Status       Status     `json:"status"`
	Roles        []string   `json:"roles"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty"`
}

// HasRole and the classification helpers centralise account separation. A
// worker is an account whose only role is RoleUser; unknown or mixed roles are
// never treated as workers (deny by default).
func (u User) HasRole(role Role) bool {
	for _, r := range u.Roles {
		if r == string(role) {
			return true
		}
	}
	return false
}

func (u User) HasAnyRole(roles ...Role) bool {
	for _, role := range roles {
		if u.HasRole(role) {
			return true
		}
	}
	return false
}

func (u User) IsAdministrative() bool {
	return u.HasAnyRole(RoleAdmin, RoleModerator, RoleReadOnly)
}

func (u User) IsWorker() bool {
	worker := false
	for _, r := range u.Roles {
		switch Role(r) {
		case RoleUser:
			worker = true
		case RoleAdmin, RoleModerator, RoleReadOnly:
			return false
		default:
			return false
		}
	}
	return worker
}

func (u User) IsAdmin() bool { return u.HasRole(RoleAdmin) }

func (u User) FullName() string {
	switch {
	case u.FirstName == "" && u.LastName == "":
		return u.DisplayName
	case u.LastName == "":
		return u.FirstName
	case u.FirstName == "":
		return u.LastName
	default:
		return u.FirstName + " " + u.LastName
	}
}
