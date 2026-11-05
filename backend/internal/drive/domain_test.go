package drive

import "testing"

func TestExportMime(t *testing.T) {
	cases := map[string]string{
		MimeDocument:     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		MimeSpreadsheet:  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		MimePresentation: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	}
	for source, want := range cases {
		got, ok := ExportMime(source)
		if !ok || got != want {
			t.Fatalf("ExportMime(%s)=%s,%v", source, got, ok)
		}
	}
	if _, ok := ExportMime(MimeVids); ok {
		t.Fatal("Vids must not be exported in the MVP")
	}
	if !IsNative(MimeDocument) || IsNative("application/pdf") {
		t.Fatal("native MIME classification is wrong")
	}
}

func TestDedupe(t *testing.T) {
	got := dedupe([]string{" a ", "a", "", "b", "b"})
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("dedupe=%v", got)
	}
}

func TestExportFormatsAndExtensions(t *testing.T) {
	if len(ExportFormats(MimeDocument)) < 8 {
		t.Fatal("Docs debe ofrecer docx, pdf, odt, rtf, txt, html, zip, epub y markdown")
	}
	cases := map[string]string{
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
		"application/pdf": ".pdf",
		"text/csv":        ".csv",
		"text/markdown":   ".md",
		"application/vnd.oasis.opendocument.presentation": ".odp",
		"image/svg+xml": ".svg",
		"application/vnd.google-apps.script+json": ".json",
		"application/json":                        ".form.json",
	}
	for mime, want := range cases {
		if got := ExportExtension(mime); got != want {
			t.Fatalf("ExportExtension(%s)=%q, want %q", mime, got, want)
		}
	}
	if got, ok := ExportMime(MimeDrawing); !ok || got != "application/pdf" {
		t.Fatalf("Drawing default=%q ok=%v", got, ok)
	}
	if got, ok := ExportMime(MimeForm); !ok || got != "application/json" {
		t.Fatalf("Form default=%q ok=%v", got, ok)
	}
	if SupportsExport(MimeVids) {
		t.Fatal("Vids must stay unsupported")
	}
}

func TestFileSelectable(t *testing.T) {
	if FileSelectable(RemoteFile{MimeType: MimeFolder}) {
		t.Fatal("una carpeta no es archivo seleccionable")
	}
	if FileSelectable(RemoteFile{MimeType: MimeShortcut, IsShortcut: true, CanDownload: true}) {
		t.Fatal("un atajo no es seleccionable")
	}
	if !FileSelectable(RemoteFile{MimeType: "application/pdf", CanDownload: true}) {
		t.Fatal("un PDF descargable debe ser seleccionable")
	}
	if FileSelectable(RemoteFile{MimeType: "application/octet-stream", CanDownload: false}) {
		t.Fatal("un binario sin canDownload no debe ser seleccionable")
	}
	if !FileSelectable(RemoteFile{MimeType: MimeForm, CanDownload: false}) {
		t.Fatal("Forms se selecciona mediante su exportación JSON")
	}
}
