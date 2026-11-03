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
