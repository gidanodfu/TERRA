package organization

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/platform/apperr"
	"terra/internal/platform/validate"
)

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) ListAreas(ctx context.Context, includeInactive bool) ([]Area, error) {
	where := "WHERE a.status = 'active'"
	if includeInactive {
		where = ""
	}
	rows, err := r.pool.Query(ctx, `SELECT a.id, a.name, a.slug, a.status, a.created_at, a.updated_at,
		(SELECT count(*) FROM positions p WHERE p.area_id = a.id),
		(SELECT count(*) FROM users u WHERE u.area_id = a.id)
		FROM areas a `+where+` ORDER BY a.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Area
	for rows.Next() {
		var a Area
		if err := rows.Scan(&a.ID, &a.Name, &a.Slug, &a.Status, &a.CreatedAt, &a.UpdatedAt,
			&a.PositionCount, &a.UserCount); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *Repository) GetArea(ctx context.Context, id uuid.UUID) (*Area, error) {
	var a Area
	err := r.pool.QueryRow(ctx, `SELECT id, name, slug, status, created_at, updated_at FROM areas WHERE id=$1`, id).
		Scan(&a.ID, &a.Name, &a.Slug, &a.Status, &a.CreatedAt, &a.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Área no encontrada.")
	}
	return &a, err
}

func (r *Repository) AreaSlugTaken(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM areas WHERE slug=$1)`, slug).Scan(&exists)
	return exists, err
}

func (r *Repository) CreateArea(ctx context.Context, a *Area) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO areas (id, name, slug, status) VALUES ($1,$2,$3,$4)`,
		a.ID, a.Name, a.Slug, a.Status)
	return err
}

func (r *Repository) UpdateArea(ctx context.Context, id uuid.UUID, name, status string) error {
	ct, err := r.pool.Exec(ctx, `UPDATE areas SET name=$2, status=$3, updated_at=now() WHERE id=$1`, id, name, status)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return apperr.NotFound("Área no encontrada.")
	}
	return nil
}

func (r *Repository) ListPositions(ctx context.Context, areaID uuid.UUID, includeInactive bool) ([]Position, error) {
	status := "AND status = 'active'"
	if includeInactive {
		status = ""
	}
	rows, err := r.pool.Query(ctx, `SELECT id, area_id, name, slug, normalized_name, status, created_at, updated_at
		FROM positions WHERE area_id=$1 `+status+` ORDER BY name`, areaID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Position
	for rows.Next() {
		var p Position
		if err := rows.Scan(&p.ID, &p.AreaID, &p.Name, &p.Slug, &p.NormalizedName, &p.Status,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repository) GetPosition(ctx context.Context, id uuid.UUID) (*Position, error) {
	var p Position
	err := r.pool.QueryRow(ctx, `SELECT id, area_id, name, slug, normalized_name, status, created_at, updated_at
		FROM positions WHERE id=$1`, id).
		Scan(&p.ID, &p.AreaID, &p.Name, &p.Slug, &p.NormalizedName, &p.Status, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Cargo no encontrado.")
	}
	return &p, err
}

func (r *Repository) CreatePosition(ctx context.Context, p *Position) error {
	_, err := r.pool.Exec(ctx, `INSERT INTO positions
		(id, area_id, name, slug, normalized_name, status) VALUES ($1,$2,$3,$4,$5,$6)`,
		p.ID, p.AreaID, p.Name, p.Slug, p.NormalizedName, p.Status)
	if err != nil && strings.Contains(err.Error(), "positions_area_name_unique") {
		return apperr.Conflict("position_exists", "Ya existe un cargo con ese nombre en el área.")
	}
	return err
}

func (r *Repository) PositionNameTaken(ctx context.Context, areaID uuid.UUID, normalized string, exclude uuid.UUID) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM positions
		WHERE area_id=$1 AND normalized_name=$2 AND id <> $3)`, areaID, normalized, exclude).Scan(&exists)
	return exists, err
}

func (r *Repository) UpdatePosition(ctx context.Context, id uuid.UUID, name, status string) error {
	ct, err := r.pool.Exec(ctx, `UPDATE positions SET name=$2, normalized_name=$3, status=$4, updated_at=now()
		WHERE id=$1`, id, name, validate.NormalizeName(name), status)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return apperr.NotFound("Cargo no encontrado.")
	}
	return nil
}

// ValidatePositionForArea aplica también la regla de base de datos en el límite del caso de uso.
func (r *Repository) ValidatePositionForArea(ctx context.Context, areaID, positionID uuid.UUID) error {
	var ok bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM positions
		WHERE id=$1 AND area_id=$2 AND status='active')`, positionID, areaID).Scan(&ok)
	if err != nil {
		return err
	}
	if !ok {
		return apperr.Invalid("El cargo seleccionado no pertenece al área o está inactivo.",
			map[string]string{"position_id": "Seleccione un cargo activo del área elegida."})
	}
	return nil
}

func uniqueSlug(ctx context.Context, base string, exists func(context.Context, string) (bool, error)) (string, error) {
	if base == "" {
		base = "item"
	}
	slug := base
	for i := 2; i < 100; i++ {
		taken, err := exists(ctx, slug)
		if err != nil {
			return "", err
		}
		if !taken {
			return slug, nil
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	return "", errors.New("no fue posible generar un slug único")
}

// SlugForArea admite nombres deterministas para las rutas de almacenamiento.
func (r *Repository) SlugForArea(ctx context.Context, base string) (string, error) {
	return uniqueSlug(ctx, base, r.AreaSlugTaken)
}

func (r *Repository) History(ctx context.Context, userID uuid.UUID) ([]History, error) {
	rows, err := r.pool.Query(ctx, `SELECT h.id, COALESCE(a.name,''), COALESCE(p.name,''),
		COALESCE(pa.name,''), COALESCE(pp.name,''),
		COALESCE(NULLIF(btrim(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.display_name, 'Sistema'),
		h.created_at
		FROM organization_history h
		LEFT JOIN areas a ON a.id = h.area_id
		LEFT JOIN positions p ON p.id = h.position_id
		LEFT JOIN areas pa ON pa.id = h.previous_area_id
		LEFT JOIN positions pp ON pp.id = h.previous_position_id
		LEFT JOIN users u ON u.id = h.actor_user_id
		WHERE h.user_id=$1 ORDER BY h.created_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []History{}
	for rows.Next() {
		var h History
		if err := rows.Scan(&h.ID, &h.AreaName, &h.PositionName, &h.PreviousAreaName,
			&h.PreviousPositionName, &h.ActorName, &h.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}
