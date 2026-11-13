package httpx

import (
	"net/url"
	"time"

	"terra/internal/platform/apperr"
)

// ParseDateRange interpreta desde/hasta como días completos inclusivos.
// El límite superior devuelto es exclusivo: inicio del día siguiente.
func ParseDateRange(query url.Values) (from, toExclusive *time.Time, err error) {
	if raw := query.Get("from"); raw != "" {
		parsed, parseErr := time.Parse("2006-01-02", raw)
		if parseErr != nil {
			return nil, nil, apperr.BadRequest("Fecha desde inválida.")
		}
		from = &parsed
	}
	if raw := query.Get("to"); raw != "" {
		parsed, parseErr := time.Parse("2006-01-02", raw)
		if parseErr != nil {
			return nil, nil, apperr.BadRequest("Fecha hasta inválida.")
		}
		next := parsed.AddDate(0, 0, 1)
		toExclusive = &next
	}
	if from != nil && toExclusive != nil && !from.Before(*toExclusive) {
		return nil, nil, apperr.BadRequest("El rango de fechas no es válido.")
	}
	return from, toExclusive, nil
}
