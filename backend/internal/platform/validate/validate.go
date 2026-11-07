// El paquete validate proporciona validadores pequeños a nivel de campo compartidos por los casos de uso.
package validate

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

func Required(fields map[string]string, key, value string) {
	if strings.TrimSpace(value) == "" {
		fields[key] = "Este campo es obligatorio."
	}
}

func MaxLen(fields map[string]string, key, value string, max int) {
	if len([]rune(value)) > max {
		fields[key] = "El valor es demasiado largo."
	}
}

// MaxItems registra el error cuando la lista supera el máximo permitido.
func MaxItems(fields map[string]string, key string, values []string, max int, message string) {
	if len(values) > max {
		fields[key] = message
	}
}

// OneOf valida una enumeración y conserva un mensaje específico por campo.
func OneOf(fields map[string]string, key, value, message string, allowed ...string) {
	for _, candidate := range allowed {
		if value == candidate {
			return
		}
	}
	fields[key] = message
}

// Slug produce un slug ASCII seguro para las restricciones de base de datos y las rutas de almacenamiento.
// Los acentos se pliegan mediante NFD para que "Área" y "Area" produzcan el mismo identificador.
func Slug(value string) string {
	lower := norm.NFD.String(strings.ToLower(strings.TrimSpace(value)))
	var b strings.Builder
	prevDash := false
	for _, r := range lower {
		if unicode.Is(unicode.Mn, r) {
			continue
		}
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		case r == ' ' || r == '-' || r == '_':
			if !prevDash && b.Len() > 0 {
				b.WriteByte('-')
				prevDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

func IsSlug(v string) bool { return slugPattern.MatchString(v) }

// CleanText recorta, colapsa espacios y compone Unicode sin cambiar mayúsculas.
// Se usa para responsabilidades, donde se conserva el texto visible.
func CleanText(v string) string {
	return norm.NFC.String(strings.Join(strings.Fields(strings.TrimSpace(v)), " "))
}

// NormalizeName define la unicidad organizativa: minúsculas, espacios colapsados y
// NFC. Los acentos se conservan significativos; la normalización es idéntica a la
// función SQL terra_normalize_org_name.
func NormalizeName(v string) string {
	return norm.NFC.String(strings.ToLower(CleanText(v)))
}
