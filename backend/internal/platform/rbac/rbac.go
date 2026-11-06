// El paquete rbac centraliza los roles administrativos y sus permisos.
// Ningún otro paquete debe duplicar la matriz rol-permiso.
package rbac

const (
	RoleAdmin     = "admin"
	RoleModerator = "moderator"
	RoleReadOnly  = "read_only"
	RoleUser      = "user"
)

const (
	PermDashboardRead        = "admin.dashboard.read"
	PermUsersRead            = "admin.users.read"
	PermUsersWrite           = "admin.users.write"
	PermAccountsRead         = "admin.accounts.read"
	PermAccountsCreate       = "admin.accounts.create"
	PermAccountsWrite        = "admin.accounts.write"
	PermOrganizationRead     = "admin.organization.read"
	PermOrganizationWrite    = "admin.organization.write"
	PermDriveRead            = "admin.drive.read"
	PermDriveBrowse          = "admin.drive.browse"
	PermJobsRead             = "admin.jobs.read"
	PermJobsCreate           = "admin.jobs.create"
	PermJobsCancel           = "admin.jobs.cancel"
	PermJobsRetry            = "admin.jobs.retry"
	PermStorageRead          = "admin.storage.read"
	PermAuditRead            = "admin.audit.read"
	PermAuditOperationalRead = "admin.audit.operational.read"
	PermPolicyWrite          = "admin.policy.write"
	PermFilesRead            = "admin.files.read"
)

var adminPermissions = []string{
	PermDashboardRead,
	PermUsersRead,
	PermUsersWrite,
	PermAccountsRead,
	PermAccountsCreate,
	PermAccountsWrite,
	PermOrganizationRead,
	PermOrganizationWrite,
	PermDriveRead,
	PermDriveBrowse,
	PermJobsRead,
	PermJobsCreate,
	PermJobsCancel,
	PermJobsRetry,
	PermStorageRead,
	PermAuditRead,
	PermPolicyWrite,
	PermFilesRead,
}

// Los permisos admin.users.* solo se aplican a cuentas clasificadas como
// trabajadores. Las cuentas administrativas usan admin.accounts.*.
var moderatorPermissions = []string{
	PermDashboardRead,
	PermUsersRead,
	PermUsersWrite,
	PermOrganizationRead,
	PermDriveRead,
	PermJobsRead,
	PermAuditOperationalRead,
}

var readOnlyPermissions = []string{
	PermDashboardRead,
	PermUsersRead,
	PermOrganizationRead,
	PermDriveRead,
	PermJobsRead,
	PermStorageRead,
	PermAuditRead,
}

var userPermissions = []string{
	"me.read", "me.profile.write", "me.drive.read", "me.drive.connect", "me.drive.disconnect",
	"me.jobs.read", "me.files.read", "me.policy.accept",
}

// IsAdministrativeRole indica si el rol pertenece a los perfiles administrativos.
func IsAdministrativeRole(role string) bool {
	switch role {
	case RoleAdmin, RoleModerator, RoleReadOnly:
		return true
	}
	return false
}

// AdministrativeRole devuelve el único rol administrativo de la cuenta.
// Devuelve false si no hay ninguno o si hay más de uno (denegación por defecto).
func AdministrativeRole(roles []string) (string, bool) {
	role := ""
	count := 0
	for _, candidate := range roles {
		if !IsAdministrativeRole(candidate) {
			continue
		}
		role = candidate
		count++
	}
	if count != 1 {
		return "", false
	}
	return role, true
}

// PermissionsFor resuelve los permisos efectivos. Una cuenta administrativa
// nunca recibe permisos de trabajador y una cuenta con roles mixtos o
// desconocidos no recibe permisos.
func PermissionsFor(roles []string) []string {
	role, ok := AdministrativeRole(roles)
	if ok {
		switch role {
		case RoleAdmin:
			return clone(adminPermissions)
		case RoleModerator:
			return clone(moderatorPermissions)
		case RoleReadOnly:
			return clone(readOnlyPermissions)
		}
	}
	if len(roles) == 1 && roles[0] == RoleUser {
		return clone(userPermissions)
	}
	return []string{}
}

// HasPermission comprueba un permiso concreto sobre la matriz central.
func HasPermission(roles []string, permission string) bool {
	for _, p := range PermissionsFor(roles) {
		if p == permission {
			return true
		}
	}
	return false
}

func clone(values []string) []string {
	out := make([]string, len(values))
	copy(out, values)
	return out
}
