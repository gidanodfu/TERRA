package downloads

import "testing"

func TestWithExtensionUsesExportMime(t *testing.T) {
	cases := []struct {
		name string
		mime string
		want string
	}{
		{"Informe", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Informe.docx"},
		{"Informe.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Informe.docx"},
		{"Presupuesto", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Presupuesto.xlsx"},
		{"Datos", "text/csv", "Datos.csv"},
		{"Notas", "text/markdown", "Notas.md"},
		{"Dibujo", "application/pdf", "Dibujo.pdf"},
		{"Encuesta", "application/json", "Encuesta.form.json"},
		{"Guion", "application/vnd.google-apps.script+json", "Guion.json"},
	}
	for _, tc := range cases {
		if got := withExtension(tc.name, tc.mime); got != tc.want {
			t.Fatalf("withExtension(%q,%q)=%q, want %q", tc.name, tc.mime, got, tc.want)
		}
	}
}
