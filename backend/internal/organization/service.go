package organization

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/platform/apperr"
	"terra/internal/platform/validate"
)

type Service struct {
	repo  *Repository
	audit *audit.Repository
}

func NewService(repo *Repository, auditRepo *audit.Repository) *Service {
	return &Service{repo: repo, audit: auditRepo}
}

func (s *Service) Areas(ctx context.Context, includeInactive bool) ([]Area, error) {
	areas, err := s.repo.ListAreas(ctx, includeInactive)
	if areas == nil {
		areas = []Area{}
	}
	return areas, err
}

func (s *Service) Positions(ctx context.Context, areaID uuid.UUID, includeInactive bool) ([]Position, error) {
	if _, err := s.repo.GetArea(ctx, areaID); err != nil {
		return nil, err
	}
	positions, err := s.repo.ListPositions(ctx, areaID, includeInactive)
	if positions == nil {
		positions = []Position{}
	}
	return positions, err
}

func (s *Service) CreateArea(ctx context.Context, actor uuid.UUID, ipHash, name string) (*Area, error) {
	name = strings.TrimSpace(name)
	fields := map[string]string{}
	validate.Required(fields, "name", name)
	validate.MaxLen(fields, "name", name, 120)
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del área.", fields)
	}
	slug, err := s.repo.SlugForArea(ctx, validate.Slug(name))
	if err != nil {
		return nil, err
	}
	a := &Area{ID: uuid.New(), Name: name, Slug: slug, Status: "active", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := s.repo.CreateArea(ctx, a); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "area.created", TargetType: "area",
		TargetID: a.ID.String(), Metadata: map[string]any{"name": name}, IPHash: ipHash})
	return a, nil
}

func (s *Service) UpdateArea(ctx context.Context, actor uuid.UUID, ipHash string, id uuid.UUID, name, status *string) (*Area, error) {
	current, err := s.repo.GetArea(ctx, id)
	if err != nil {
		return nil, err
	}
	newName := current.Name
	if name != nil {
		newName = strings.TrimSpace(*name)
	}
	newStatus := current.Status
	if status != nil {
		newStatus = *status
	}
	fields := map[string]string{}
	validate.Required(fields, "name", newName)
	validate.MaxLen(fields, "name", newName, 120)
	if newStatus != "active" && newStatus != "inactive" {
		fields["status"] = "Estado inválido."
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del área.", fields)
	}
	if err := s.repo.UpdateArea(ctx, id, newName, newStatus); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "area.updated", TargetType: "area",
		TargetID: id.String(), Metadata: map[string]any{"name": newName, "status": newStatus}, IPHash: ipHash})
	return s.repo.GetArea(ctx, id)
}

func (s *Service) CreatePosition(ctx context.Context, actor uuid.UUID, ipHash string, areaID uuid.UUID, name string) (*Position, error) {
	name = strings.TrimSpace(name)
	fields := map[string]string{}
	validate.Required(fields, "name", name)
	validate.MaxLen(fields, "name", name, 120)
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del cargo.", fields)
	}
	if _, err := s.repo.GetArea(ctx, areaID); err != nil {
		return nil, err
	}
	p := &Position{
		ID: uuid.New(), AreaID: areaID, Name: name,
		Slug: validate.Slug(name), NormalizedName: validate.NormalizeName(name), Status: "active",
	}
	if err := s.repo.CreatePosition(ctx, p); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "position.created", TargetType: "position",
		TargetID: p.ID.String(), Metadata: map[string]any{"name": name, "area_id": areaID}, IPHash: ipHash})
	return s.repo.GetPosition(ctx, p.ID)
}

func (s *Service) UpdatePosition(ctx context.Context, actor uuid.UUID, ipHash string, id uuid.UUID, name, status *string) (*Position, error) {
	current, err := s.repo.GetPosition(ctx, id)
	if err != nil {
		return nil, err
	}
	newName := current.Name
	if name != nil {
		newName = strings.TrimSpace(*name)
	}
	newStatus := current.Status
	if status != nil {
		newStatus = *status
	}
	fields := map[string]string{}
	validate.Required(fields, "name", newName)
	validate.MaxLen(fields, "name", newName, 120)
	if newStatus != "active" && newStatus != "inactive" {
		fields["status"] = "Estado inválido."
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del cargo.", fields)
	}
	if newName != current.Name {
		taken, err := s.repo.PositionNameTaken(ctx, current.AreaID, validate.NormalizeName(newName), id)
		if err != nil {
			return nil, err
		}
		if taken {
			return nil, apperr.Conflict("position_exists", "Ya existe un cargo con ese nombre en el área.")
		}
	}
	if err := s.repo.UpdatePosition(ctx, id, newName, newStatus); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "position.updated", TargetType: "position",
		TargetID: id.String(), Metadata: map[string]any{"name": newName, "status": newStatus}, IPHash: ipHash})
	return s.repo.GetPosition(ctx, id)
}
