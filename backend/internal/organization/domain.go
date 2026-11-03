// Package organization owns the municipal catalogue: areas, positions and their
// historical assignments. Positions are organizational data, never security roles.
package organization

import (
	"time"

	"github.com/google/uuid"
)

type Area struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	Slug          string    `json:"slug"`
	Status        string    `json:"status"`
	PositionCount int       `json:"position_count"`
	UserCount     int       `json:"user_count"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Position struct {
	ID             uuid.UUID `json:"id"`
	AreaID         uuid.UUID `json:"area_id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	NormalizedName string    `json:"-"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type History struct {
	ID                   int64     `json:"id"`
	AreaName             string    `json:"area_name,omitempty"`
	PositionName         string    `json:"position_name,omitempty"`
	PreviousAreaName     string    `json:"previous_area_name,omitempty"`
	PreviousPositionName string    `json:"previous_position_name,omitempty"`
	ActorName            string    `json:"actor_name,omitempty"`
	CreatedAt            time.Time `json:"created_at"`
}
