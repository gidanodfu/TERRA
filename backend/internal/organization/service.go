package organization

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

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

const (
	maxResponsibilities       = 20
	maxResponsibilityLength   = 300
	responsibilitiesFieldName = "responsibilities"
)

// cleanResponsibilities valida y normaliza la lista. La lista vacía es válida.
func cleanResponsibilities(values []string) ([]string, string) {
	if len(values) > maxResponsibilities {
		return nil, "Puede registrar como máximo 20 responsabilidades."
	}
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, raw := range values {
		value := validate.CleanText(raw)
		if value == "" {
			return nil, "Las responsabilidades no pueden estar vacías."
		}
		if utf8.RuneCountInString(value) > maxResponsibilityLength {
			return nil, "Cada responsabilidad puede tener como máximo 300 caracteres."
		}
		key := validate.NormalizeName(value)
		if seen[key] {
			return nil, "No repita responsabilidades dentro de la misma lista."
		}
		seen[key] = true
		out = append(out, value)
	}
	return out, ""
}

func conflict(field, code, message string) error {
	return apperr.ConflictFields(code, message, map[string]string{field: message})
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

func (s *Service) CreateArea(ctx context.Context, actor uuid.UUID, ipHash, name string, responsibilities []string) (*Area, error) {
	name = strings.TrimSpace(name)
	fields := map[string]string{}
	validate.Required(fields, "name", name)
	validate.MaxLen(fields, "name", name, 120)
	cleanResp, respErr := cleanResponsibilities(responsibilities)
	if respErr != "" {
		fields[responsibilitiesFieldName] = respErr
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del área.", fields)
	}
	taken, err := s.repo.AreaNameTaken(ctx, validate.NormalizeName(name), uuid.Nil)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, conflict("name", "area_exists",
			"Ya existe un área con ese nombre. Las áreas inactivas también conservan su nombre.")
	}
	slug, err := s.repo.SlugForArea(ctx, validate.Slug(name))
	if err != nil {
		return nil, err
	}
	a := &Area{ID: uuid.New(), Name: name, Slug: slug, Status: "active",
		Responsibilities: cleanResp, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := s.repo.CreateArea(ctx, a); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "area.created", TargetType: "area",
		TargetID: a.ID.String(), Metadata: map[string]any{"name": name}, IPHash: ipHash})
	return a, nil
}

func (s *Service) UpdateArea(ctx context.Context, actor uuid.UUID, ipHash string, id uuid.UUID,
	name, status *string, responsibilities *[]string) (*Area, error) {
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
	newResp := current.Responsibilities
	fields := map[string]string{}
	validate.Required(fields, "name", newName)
	validate.MaxLen(fields, "name", newName, 120)
	if newStatus != "active" && newStatus != "inactive" {
		fields["status"] = "Estado inválido."
	}
	if responsibilities != nil {
		cleanResp, respErr := cleanResponsibilities(*responsibilities)
		if respErr != "" {
			fields[responsibilitiesFieldName] = respErr
		} else {
			newResp = cleanResp
		}
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del área.", fields)
	}
	taken, err := s.repo.AreaNameTaken(ctx, validate.NormalizeName(newName), id)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, conflict("name", "area_exists",
			"Ya existe un área con ese nombre. Las áreas inactivas también conservan su nombre.")
	}
	if err := s.repo.UpdateArea(ctx, id, newName, newStatus, newResp); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "area.updated", TargetType: "area",
		TargetID: id.String(), Metadata: map[string]any{"name": newName, "status": newStatus}, IPHash: ipHash})
	return s.repo.GetArea(ctx, id)
}

func (s *Service) CreatePosition(ctx context.Context, actor uuid.UUID, ipHash string,
	areaID uuid.UUID, name string, responsibilities []string) (*Position, error) {
	name = strings.TrimSpace(name)
	fields := map[string]string{}
	validate.Required(fields, "name", name)
	validate.MaxLen(fields, "name", name, 120)
	cleanResp, respErr := cleanResponsibilities(responsibilities)
	if respErr != "" {
		fields[responsibilitiesFieldName] = respErr
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del cargo.", fields)
	}
	area, err := s.repo.GetArea(ctx, areaID)
	if err != nil {
		return nil, err
	}
	if area.Status != "active" {
		return nil, apperr.Invalid("El área está inactiva.", map[string]string{"areaId": "Seleccione un área activa."})
	}
	taken, err := s.repo.PositionNameTaken(ctx, areaID, validate.NormalizeName(name), uuid.Nil)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, conflict("name", "position_exists",
			"Ya existe un cargo con ese nombre dentro del área seleccionada.")
	}
	p := &Position{
		ID: uuid.New(), AreaID: areaID, Name: name,
		Slug: validate.Slug(name), NormalizedName: validate.NormalizeName(name),
		Status: "active", Responsibilities: cleanResp,
	}
	if err := s.repo.CreatePosition(ctx, p); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "position.created", TargetType: "position",
		TargetID: p.ID.String(), Metadata: map[string]any{"name": name, "area_id": areaID}, IPHash: ipHash})
	return s.repo.GetPosition(ctx, p.ID)
}

func (s *Service) UpdatePosition(ctx context.Context, actor uuid.UUID, ipHash string, id uuid.UUID,
	name, status *string, responsibilities *[]string) (*Position, error) {
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
	newResp := current.Responsibilities
	fields := map[string]string{}
	validate.Required(fields, "name", newName)
	validate.MaxLen(fields, "name", newName, 120)
	if newStatus != "active" && newStatus != "inactive" {
		fields["status"] = "Estado inválido."
	}
	if responsibilities != nil {
		cleanResp, respErr := cleanResponsibilities(*responsibilities)
		if respErr != "" {
			fields[responsibilitiesFieldName] = respErr
		} else {
			newResp = cleanResp
		}
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise los datos del cargo.", fields)
	}
	taken, err := s.repo.PositionNameTaken(ctx, current.AreaID, validate.NormalizeName(newName), id)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, conflict("name", "position_exists",
			"Ya existe un cargo con ese nombre dentro del área seleccionada.")
	}
	if err := s.repo.UpdatePosition(ctx, id, newName, newStatus, newResp); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "position.updated", TargetType: "position",
		TargetID: id.String(), Metadata: map[string]any{"name": newName, "status": newStatus}, IPHash: ipHash})
	return s.repo.GetPosition(ctx, id)
}
