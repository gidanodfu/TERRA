// Package validate provides small field-level validators shared by use cases.
package validate

import (
	"regexp"
	"strings"
	"unicode"
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

func Slug(value string) string {
	var b strings.Builder
	prevDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
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
