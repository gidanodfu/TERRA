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

func NormalizeName(v string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(v)), " "))
}
