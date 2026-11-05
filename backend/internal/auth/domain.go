// El paquete auth implementa el inicio de sesión de trabajadores con Google, el inicio de sesión local de administradores,
// las sesiones del lado del servidor, la protección CSRF y la autorización de rutas.
package auth

import (
	"time"

	"github.com/google/uuid"

	"terra/internal/platform/rbac"
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

// PermissionsFor conserva el punto de entrada histórico y delega en la matriz RBAC.
func PermissionsFor(roles []string) []string {
	return rbac.PermissionsFor(roles)
}
