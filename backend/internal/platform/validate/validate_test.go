package validate

import "testing"

func TestNormalizeName(t *testing.T) {
	cases := map[string]string{
		"  Recursos   Humanos ": "recursos humanos",
		"RECURSOS HUMANOS":      "recursos humanos",
		"Recursos\tHumanos":     "recursos humanos",
		"Recursos\nHumanos":     "recursos humanos",
		"José":                  "josé",
		"Jose\u0301":            "josé",
		"Área  de   Prueba":     "área de prueba",
	}
	for input, want := range cases {
		if got := NormalizeName(input); got != want {
			t.Fatalf("NormalizeName(%q)=%q, se esperaba %q", input, got, want)
		}
	}
	if NormalizeName("Recursos Humanos") == NormalizeName("Recursos Humanós") {
		t.Fatal("los acentos deben seguir siendo significativos")
	}
	if got := CleanText("  Recepción   de documentos "); got != "Recepción de documentos" {
		t.Fatalf("CleanText=%q", got)
	}
}
