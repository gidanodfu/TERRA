// El paquete principal transporta la identidad autenticada en los contextos de petición
// sin importar paquetes de dominio (evita ciclos de dependencia).
package principal

import (
	"context"

	"github.com/google/uuid"
)

type Identity struct {
	ID          uuid.UUID  `json:"id"`
	FirstName   string     `json:"first_name"`
	LastName    string     `json:"last_name"`
	DisplayName string     `json:"display_name"`
	Email       string     `json:"email,omitempty"`
	AreaID      *uuid.UUID `json:"area_id,omitempty"`
	PositionID  *uuid.UUID `json:"position_id,omitempty"`
	Status      string     `json:"status"`
	Roles       []string   `json:"roles"`
	Permissions []string   `json:"-"`
}

func (i Identity) HasRole(role string) bool {
	for _, r := range i.Roles {
		if r == role {
			return true
		}
	}
	return false
}

func (i Identity) HasAnyRole(roles ...string) bool {
	for _, role := range roles {
		if i.HasRole(role) {
			return true
		}
	}
	return false
}

func (i Identity) Can(permission string) bool {
	for _, p := range i.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

func (i Identity) IsAdministrative() bool {
	return i.HasAnyRole("admin", "moderator", "read_only")
}

func (i Identity) IsAdmin() bool { return i.HasRole("admin") }

type Principal struct {
	User      Identity
	SessionID uuid.UUID
}

type ctxKey int

const key ctxKey = 1

func With(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, key, p)
}

func From(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(key).(Principal)
	return p, ok
}

func Current(ctx context.Context) (Identity, bool) {
	p, ok := From(ctx)
	if !ok {
		return Identity{}, false
	}
	return p.User, true
}

func UserID(ctx context.Context) (uuid.UUID, bool) {
	i, ok := Current(ctx)
	if !ok {
		return uuid.Nil, false
	}
	return i.ID, true
}
