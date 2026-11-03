package storage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestSanitizeRejectsTraversalAndControlChars(t *testing.T) {
	cases := map[string]string{
		"..":                   "_",
		"a/b\\c":               "a_b_c",
		"CON":                  "_CON",
		"name\x00with\x1fctrl": "name_with_ctrl",
		"   ":                  "_",
	}
	for in, want := range cases {
		if got := Sanitize(in); got != want {
			t.Errorf("Sanitize(%q)=%q want %q", in, got, want)
		}
	}
	traversal := Sanitize("../../etc/passwd")
	if strings.ContainsAny(traversal, "/\\") || strings.HasPrefix(traversal, "..") {
		t.Fatalf("traversal survived sanitization: %q", traversal)
	}
}

func TestSanitizeLength(t *testing.T) {
	got := Sanitize(strings.Repeat("á", 300))
	if len(got) > 120 {
		t.Fatalf("length %d > 120", len(got))
	}
	if !strings.HasPrefix(got, "á") {
		t.Fatalf("unexpected truncation: %q", got)
	}
}

func TestUniqueNameDeterministicSuffix(t *testing.T) {
	used := map[string]string{}
	a := UniqueName(used, "nota.pdf", "ID-AAAA1111")
	b := UniqueName(used, "nota.pdf", "ID-BBBB2222")
	if a == b {
		t.Fatal("collision was not resolved")
	}
	if b != "nota.pdf~ID-BBBB2" && !strings.HasPrefix(b, "nota.pdf~") {
		t.Fatalf("unexpected suffix: %q", b)
	}
	if again := UniqueName(used, "nota.pdf", "ID-AAAA1111"); again != a {
		t.Fatal("same Drive ID must map to the same name")
	}
}

func TestAbsRejectsEscapes(t *testing.T) {
	store, err := New(t.TempDir(), 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, rel := range []string{"../escape", "/etc/passwd", "a/../../b", "a//b", "a\\b", ""} {
		if _, err := store.Abs(rel); err == nil {
			t.Errorf("Abs(%q) unexpectedly allowed", rel)
		}
	}
	if _, err := store.Abs("areas/area-1--x/Mi unidad/a.txt"); err != nil {
		t.Errorf("valid path rejected: %v", err)
	}
}

func TestEnsureDirRefusesSymlink(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	store, err := New(root, 0)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(store.Root(), "areas", "link")); err != nil {
		t.Skip("symlinks unsupported")
	}
	if _, err := store.EnsureDir("areas/link/sub"); err == nil {
		t.Fatal("EnsureDir followed a symlink outside the root")
	}
}

func TestJobRootUsesIdentityNotNames(t *testing.T) {
	store, err := New(t.TempDir(), 0)
	if err != nil {
		t.Fatal(err)
	}
	areaID, positionID, userID, jobID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	rel, err := store.JobRoot(areaID, "Recursos Humanos", positionID, "Asistente", userID, jobID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(rel, "area-"+areaID.String()+"--recursos-humanos") {
		t.Fatalf("missing area identity: %s", rel)
	}
	if !strings.Contains(rel, "user-"+userID.String()) || !strings.Contains(rel, "job-"+jobID.String()) {
		t.Fatalf("missing stable identities: %s", rel)
	}
	if !strings.HasSuffix(rel, "Mi unidad") {
		t.Fatalf("missing My Drive root: %s", rel)
	}
}

func TestFreeBytes(t *testing.T) {
	store, err := New(t.TempDir(), 0)
	if err != nil {
		t.Fatal(err)
	}
	free, err := store.FreeBytes()
	if err != nil || free <= 0 {
		t.Fatalf("free bytes: %d %v", free, err)
	}
}
