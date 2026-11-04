package users

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/organization"
	"terra/internal/platform/apperr"
	"terra/internal/platform/validate"
)

type Service struct {
	repo  *Repository
	org   *organization.Repository
	audit *audit.Repository
}

func NewService(repo *Repository, org *organization.Repository, auditRepo *audit.Repository) *Service {
	return &Service{repo: repo, org: org, audit: auditRepo}
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (*User, error) {
	return s.repo.GetByID(ctx, id)
}

// UpdateOwnProfile validates both fields and the area/position relationship before writing.
func (s *Service) UpdateOwnProfile(ctx context.Context, userID uuid.UUID, in UpdateProfileInput, ipHash string) (*User, error) {
	current, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !current.IsWorker() {
		return nil, apperr.Forbidden("Solo las cuentas de trabajador pueden actualizar su perfil organizativo.")
	}
	in.FirstName = strings.TrimSpace(in.FirstName)
	in.LastName = strings.TrimSpace(in.LastName)
	fields := map[string]string{}
	validate.Required(fields, "first_name", in.FirstName)
	validate.Required(fields, "last_name", in.LastName)
	validate.MaxLen(fields, "first_name", in.FirstName, 100)
	validate.MaxLen(fields, "last_name", in.LastName, 100)
	if in.AreaID == nil {
		fields["area_id"] = "Seleccione un área."
	}
	if in.PositionID == nil {
		fields["position_id"] = "Seleccione un cargo."
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Complete todos los campos obligatorios.", fields)
	}
	area, err := s.org.GetArea(ctx, *in.AreaID)
	if err != nil {
		return nil, err
	}
	if area.Status != "active" {
		return nil, apperr.Invalid("El área seleccionada está inactiva.",
			map[string]string{"area_id": "Seleccione un área activa."})
	}
	if err := s.org.ValidatePositionForArea(ctx, *in.AreaID, *in.PositionID); err != nil {
		return nil, err
	}
	if err := s.repo.UpdateProfile(ctx, userID, in, userID); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &userID, Action: "user.profile.updated", TargetType: "user",
		TargetID: userID.String(), Metadata: map[string]any{"area_id": in.AreaID, "position_id": in.PositionID}, IPHash: ipHash})
	return s.repo.GetByID(ctx, userID)
}
