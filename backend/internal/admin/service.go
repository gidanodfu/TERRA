// El paquete admin coordina casos de uso administrativos entre módulos: dashboard,
// gestión de trabajadores, consultas de auditoría y asignación organizativa.
package admin

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/audit"
	"terra/internal/downloads"
	"terra/internal/drive"
	"terra/internal/organization"
	"terra/internal/platform/apperr"
	"terra/internal/platform/password"
	"terra/internal/platform/rbac"
	"terra/internal/platform/validate"
	"terra/internal/users"
)

type Service struct {
	users    *users.Repository
	org      *organization.Repository
	audit    *audit.Repository
	drive    *drive.Repository
	download *downloads.Repository
	pool     *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool, usersRepo *users.Repository, org *organization.Repository,
	auditRepo *audit.Repository, driveRepo *drive.Repository, downloadRepo *downloads.Repository) *Service {
	return &Service{pool: pool, users: usersRepo, org: org, audit: auditRepo, drive: driveRepo, download: downloadRepo}
}

func (s *Service) poolRef() *pgxpool.Pool { return s.pool }

type Dashboard struct {
	ActiveUsers       int           `json:"active_users"`
	PendingProfiles   int           `json:"pending_profiles"`
	SuspendedUsers    int           `json:"suspended_users"`
	Areas             int           `json:"areas"`
	Positions         int           `json:"positions"`
	QueuedJobs        int           `json:"queued_jobs"`
	RunningJobs       int           `json:"running_jobs"`
	WaitingAuthJobs   int           `json:"waiting_authorization_jobs"`
	CompletedJobs     int           `json:"completed_jobs"`
	FailedJobs        int           `json:"failed_jobs"`
	StoredBytes       int64         `json:"stored_bytes"`
	ConnectedDrives   int           `json:"connected_drives"`
	ReauthDrives      int           `json:"reauth_drives"`
	OldestQueueAgeSec int64         `json:"oldest_queue_age_seconds"`
	RecentAudit       []audit.Event `json:"recent_activity"`
}

func (s *Service) Dashboard(ctx context.Context, includeAudit bool) (*Dashboard, error) {
	d := &Dashboard{RecentAudit: []audit.Event{}}
	if err := s.downloadPoolQuery(ctx, d); err != nil {
		return nil, err
	}
	if !includeAudit {
		return d, nil
	}
	events, _, err := s.audit.List(ctx, audit.ListFilter{Page: 1, Size: 10})
	if err != nil {
		return nil, err
	}
	if events != nil {
		d.RecentAudit = events
	}
	return d, nil
}

// queryDashboard vive en repository.go para mantener SQL fuera de este caso de uso.
func (s *Service) downloadPoolQuery(ctx context.Context, d *Dashboard) error {
	return s.queryDashboard(ctx, d)
}

func (s *Service) Users(ctx context.Context, f users.ListFilter) ([]users.User, int, error) {
	list, total, err := s.users.List(ctx, f)
	if list == nil {
		list = []users.User{}
	}
	return list, total, err
}

type UserDetail struct {
	User            *users.User            `json:"user"`
	DriveConnection *drive.Connection      `json:"drive_connection,omitempty"`
	History         []organization.History `json:"organization_history"`
}

func (s *Service) User(ctx context.Context, id uuid.UUID) (*UserDetail, error) {
	user, err := s.users.GetWorkerByID(ctx, id)
	if err != nil {
		return nil, err
	}
	detail := &UserDetail{User: user, History: []organization.History{}}
	if conn, err := s.drive.GetByUser(ctx, id); err == nil {
		detail.DriveConnection = conn
	}
	history, err := s.org.History(ctx, id)
	if err == nil {
		detail.History = history
	}
	return detail, nil
}

type UpdateUserInput struct {
	AreaID     *uuid.UUID `json:"area_id"`
	PositionID *uuid.UUID `json:"position_id"`
	Status     *string    `json:"status"`
}

func (s *Service) UpdateUser(ctx context.Context, actor uuid.UUID, target uuid.UUID, in UpdateUserInput, ipHash string) (*users.User, error) {
	if err := s.requireActorPermission(ctx, actor, rbac.PermUsersWrite); err != nil {
		return nil, err
	}
	current, err := s.users.GetWorkerByID(ctx, target)
	if err != nil {
		return nil, err
	}
	previousStatus := current.Status
	areaID, positionID := current.AreaID, current.PositionID
	if in.AreaID != nil || in.PositionID != nil {
		if in.AreaID == nil || in.PositionID == nil {
			return nil, apperr.Invalid("Área y cargo deben actualizarse juntos.",
				map[string]string{"area_id": "Seleccione área y cargo.", "position_id": "Seleccione área y cargo."})
		}
		area, err := s.org.GetArea(ctx, *in.AreaID)
		if err != nil {
			return nil, err
		}
		if area.Status != "active" {
			return nil, apperr.Invalid("El área está inactiva.", map[string]string{"area_id": "Seleccione un área activa."})
		}
		if err := s.org.ValidatePositionForArea(ctx, *in.AreaID, *in.PositionID); err != nil {
			return nil, err
		}
		areaID, positionID = in.AreaID, in.PositionID
	}
	status := users.Status(current.Status)
	if in.Status != nil {
		status = users.Status(*in.Status)
		switch status {
		case users.StatusActive, users.StatusSuspended, users.StatusDisabled, users.StatusPendingProfile:
		default:
			return nil, apperr.Invalid("Estado de usuario inválido.", map[string]string{"status": "Estado inválido."})
		}
		if status == users.StatusActive && (areaID == nil || positionID == nil) {
			return nil, apperr.Invalid("Para activar al trabajador debe tener área y cargo.",
				map[string]string{"status": "Asigne área y cargo antes de activar."})
		}
		if target == actor && status != users.StatusActive {
			return nil, apperr.Conflict("cannot_suspend_self", "No puede suspender o desactivar su propia cuenta.")
		}
	}
	updated, err := s.users.AdminUpdate(ctx, target, areaID, positionID, status, actor)
	if err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "admin.user.updated", TargetType: "user",
		TargetID: target.String(), Metadata: map[string]any{
			"kind":            "worker",
			"previous_status": string(previousStatus),
			"status":          string(status),
			"area_id":         areaID,
			"position_id":     positionID,
			"result":          "applied",
		}, IPHash: ipHash})
	return updated, nil
}

type AdministrativeAccount struct {
	ID                 uuid.UUID  `json:"id"`
	FirstName          string     `json:"first_name"`
	LastName           string     `json:"last_name"`
	DisplayName        string     `json:"display_name"`
	Username           string     `json:"username"`
	Role               string     `json:"role"`
	Status             string     `json:"status"`
	CreatedAt          time.Time  `json:"created_at"`
	LastLoginAt        *time.Time `json:"last_login_at,omitempty"`
	IsPrincipal        bool       `json:"is_principal"`
	MustRotatePassword bool       `json:"must_rotate_password"`
}

func newAdministrativeAccount(u users.User, principalID uuid.UUID, principalResolved bool) AdministrativeAccount {
	role, _ := rbac.AdministrativeRole(u.Roles)
	return AdministrativeAccount{
		ID: u.ID, FirstName: u.FirstName, LastName: u.LastName, DisplayName: u.DisplayName,
		Username: u.Username, Role: role, Status: string(u.Status), CreatedAt: u.CreatedAt,
		LastLoginAt: u.LastLoginAt, IsPrincipal: principalResolved && u.ID == principalID,
		MustRotatePassword: u.MustRotatePassword,
	}
}

func (s *Service) AdministrativeAccounts(ctx context.Context, f users.ListFilter) ([]AdministrativeAccount, int, error) {
	list, total, err := s.users.ListAdministrative(ctx, f)
	if err != nil {
		return nil, 0, err
	}
	principalID, resolved, err := s.principalAdminID(ctx)
	if err != nil {
		return nil, 0, err
	}
	accounts := make([]AdministrativeAccount, 0, len(list))
	for _, u := range list {
		accounts = append(accounts, newAdministrativeAccount(u, principalID, resolved))
	}
	return accounts, total, nil
}

type CreateAdministrativeAccountInput struct {
	Role                 string `json:"role"`
	FirstName            string `json:"first_name"`
	LastName             string `json:"last_name"`
	Username             string `json:"username"`
	Password             string `json:"password"`
	PasswordConfirmation string `json:"password_confirmation"`
}

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,63}$`)

// CreateAdministrativeAccount valida identidad, credenciales y rol, y crea la
// cuenta completa en una única transacción.
func (s *Service) CreateAdministrativeAccount(ctx context.Context, actor uuid.UUID,
	in CreateAdministrativeAccountInput, ipHash string) (*AdministrativeAccount, error) {
	actorUser, err := s.users.GetByID(ctx, actor)
	if err != nil {
		return nil, err
	}
	if !rbac.HasPermission(actorUser.Roles, rbac.PermAccountsCreate) {
		return nil, apperr.Forbidden("No tiene permisos para crear cuentas administrativas.")
	}

	role := strings.ToLower(strings.TrimSpace(in.Role))
	firstName := strings.TrimSpace(in.FirstName)
	lastName := strings.TrimSpace(in.LastName)
	username := strings.ToLower(strings.TrimSpace(in.Username))
	fields := map[string]string{}
	if !rbac.IsAdministrativeRole(role) {
		fields["role"] = "Seleccione un rol administrativo válido."
	}
	validate.Required(fields, "first_name", firstName)
	validate.Required(fields, "last_name", lastName)
	validate.MaxLen(fields, "first_name", firstName, 100)
	validate.MaxLen(fields, "last_name", lastName, 100)
	if username == "" {
		fields["username"] = "Ingrese un nombre de usuario."
	} else if !usernamePattern.MatchString(username) {
		fields["username"] = "Use de 3 a 64 caracteres: letras minúsculas, números, punto, guion o guion bajo."
	}
	if in.Password == "" {
		fields["password"] = "Ingrese una contraseña."
	} else if err := password.ValidateStrength(in.Password); err != nil {
		fields["password"] = "La contraseña no cumple la política: " + err.Error() + "."
	}
	if in.PasswordConfirmation == "" {
		fields["password_confirmation"] = "Confirme la contraseña."
	} else if in.Password != in.PasswordConfirmation {
		fields["password_confirmation"] = "Las contraseñas no coinciden."
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos de la cuenta administrativa.", fields)
	}

	exists, err := s.users.UsernameExists(ctx, username)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, apperr.Conflict("username_taken", "El nombre de usuario ya está en uso.")
	}
	hash, err := password.Hash(in.Password)
	if err != nil {
		return nil, err
	}
	created, err := s.createAdministrativeAccountRecord(ctx, createAdministrativeRecord{
		ID: uuid.New(), FirstName: firstName, LastName: lastName,
		DisplayName: firstName + " " + lastName, Username: username,
		PasswordHash: hash, Role: role,
	}, actor, ipHash)
	if err != nil {
		return nil, err
	}
	principalID, resolved, err := s.principalAdminID(ctx)
	if err != nil {
		return nil, err
	}
	account := newAdministrativeAccount(*created, principalID, resolved)
	return &account, nil
}

func (s *Service) requireActorPermission(ctx context.Context, actor uuid.UUID, permission string) error {
	actorUser, err := s.users.GetByID(ctx, actor)
	if err != nil {
		return err
	}
	if !rbac.HasPermission(actorUser.Roles, permission) {
		return apperr.Forbidden("No tiene permisos para esta operación.")
	}
	return nil
}

func (s *Service) accountForUser(ctx context.Context, u *users.User) (*AdministrativeAccount, error) {
	principalID, resolved, err := s.principalAdminID(ctx)
	if err != nil {
		return nil, err
	}
	account := newAdministrativeAccount(*u, principalID, resolved)
	return &account, nil
}

// UpdateAdministrativeAccount cambia el estado de una cuenta administrativa.
// Solo el rol admin puede llegar a este caso de uso (guarda de ruta); el
// administrador principal está protegido y un identificador ausente falla de forma segura.
func (s *Service) UpdateAdministrativeAccount(ctx context.Context, actor, target uuid.UUID, rawStatus, ipHash string) (*AdministrativeAccount, error) {
	if err := s.requireActorPermission(ctx, actor, rbac.PermAccountsWrite); err != nil {
		return nil, err
	}
	status := users.Status(strings.TrimSpace(rawStatus))
	switch status {
	case users.StatusActive, users.StatusDisabled:
	default:
		return nil, apperr.Invalid("Estado de cuenta administrativa inválido.",
			map[string]string{"status": "Use active o disabled."})
	}
	current, err := s.users.GetAdministrativeByID(ctx, target)
	if err != nil {
		return nil, err
	}
	if target == actor && status == users.StatusDisabled {
		s.recordAccountEvent(ctx, actor, target, "admin.account.status_rejected",
			current.Status, status, "cannot_disable_self", ipHash)
		return nil, apperr.Conflict("cannot_suspend_self", "No puede desactivar su propia cuenta.")
	}
	if status == users.StatusDisabled {
		principalID, resolved, err := s.principalAdminID(ctx)
		if err != nil {
			return nil, err
		}
		if !resolved {
			s.recordAccountEvent(ctx, actor, target, "admin.account.status_rejected",
				current.Status, status, "principal_admin_unresolved", ipHash)
			return nil, apperr.New(http.StatusServiceUnavailable, "principal_admin_unresolved",
				"No se pudo verificar el administrador principal; la desactivación está bloqueada.")
		}
		if target == principalID {
			s.recordAccountEvent(ctx, actor, target, "admin.account.status_rejected",
				current.Status, status, "principal_admin_protected", ipHash)
			return nil, apperr.Conflict("principal_admin_protected",
				"El administrador principal no puede desactivarse.")
		}
	}
	updated, err := s.users.SetAdministrativeStatus(ctx, target, status)
	if err != nil {
		return nil, err
	}
	action := "admin.account.reactivated"
	if status == users.StatusDisabled {
		action = "admin.account.disabled"
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: action, TargetType: "user",
		TargetID: target.String(), Metadata: map[string]any{
			"kind":            "administrative",
			"previous_status": string(current.Status),
			"status":          string(status),
			"roles":           current.Roles,
			"result":          "applied",
		}, IPHash: ipHash})
	return s.accountForUser(ctx, updated)
}

func (s *Service) recordAccountEvent(ctx context.Context, actor, target uuid.UUID, action string,
	previous, next users.Status, reason, ipHash string) {
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: action, TargetType: "user",
		TargetID: target.String(), Metadata: map[string]any{
			"kind":            "administrative",
			"previous_status": string(previous),
			"status":          string(next),
			"reason":          reason,
			"result":          "rejected",
		}, IPHash: ipHash})
}

// principalAdminID lee bootstrap_state.details.admin_user_id y verifica que
// la cuenta siga existiendo y tenga el rol admin. Un dato ausente o inválido
// se informa como no resuelto para que los llamadores fallen de forma segura.
func (s *Service) principalAdminID(ctx context.Context) (uuid.UUID, bool, error) {
	var raw *string
	err := s.pool.QueryRow(ctx, `SELECT details->>'admin_user_id' FROM bootstrap_state WHERE id = 1`).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, err
	}
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return uuid.Nil, false, nil
	}
	id, err := uuid.Parse(strings.TrimSpace(*raw))
	if err != nil {
		return uuid.Nil, false, nil
	}
	var hasAdminRole bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM user_roles ur JOIN system_roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1 AND r.key = 'admin')`, id).Scan(&hasAdminRole); err != nil {
		return uuid.Nil, false, err
	}
	if !hasAdminRole {
		return uuid.Nil, false, nil
	}
	return id, true, nil
}

func (s *Service) Audit(ctx context.Context, f audit.ListFilter) ([]audit.Event, int, error) {
	events, total, err := s.audit.List(ctx, f)
	if events == nil {
		events = []audit.Event{}
	}
	return events, total, err
}
