// Package storage owns every filesystem path in TERRA. Callers only ever handle
// paths relative to STORAGE_ROOT; absolute paths never reach clients.
package storage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

type Store struct {
	root    string
	minFree int64
}

// New prepares a writable store (worker and bootstrap).
func New(root string, minFree int64) (*Store, error) {
	return newStore(root, minFree, true)
}

// NewReadOnly opens an existing store without modifying it (API container).
func NewReadOnly(root string, minFree int64) (*Store, error) {
	return newStore(root, minFree, false)
}

func newStore(root string, minFree int64, writable bool) (*Store, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("STORAGE_ROOT is required")
	}
	if writable {
		if err := os.MkdirAll(root, 0o750); err != nil {
			return nil, fmt.Errorf("create storage root: %w", err)
		}
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	for _, dir := range []string{"staging", "areas"} {
		path := filepath.Join(resolved, dir)
		if writable {
			if err := os.MkdirAll(path, 0o750); err != nil {
				return nil, err
			}
			continue
		}
		info, err := os.Stat(path)
		if err != nil || !info.IsDir() {
			return nil, fmt.Errorf("storage directory missing or invalid: %s", path)
		}
	}
	return &Store{root: resolved, minFree: minFree}, nil
}

func (s *Store) Root() string { return s.root }

// JobRoot builds the municipal classification and the independent snapshot root.
func (s *Store) JobRoot(areaID uuid.UUID, areaSlug string, positionID uuid.UUID, positionSlug string,
	userID, jobID uuid.UUID) (string, error) {
	segments := []string{
		"areas", fmt.Sprintf("area-%s--%s", areaID, Slug(areaSlug)),
		"cargos", fmt.Sprintf("cargo-%s--%s", positionID, Slug(positionSlug)),
		"usuarios", "user-" + userID.String(),
		"drive-backups", "job-" + jobID.String(),
		"Mi unidad",
	}
	rel := strings.Join(segments, "/")
	if _, err := s.Abs(rel); err != nil {
		return "", err
	}
	return rel, nil
}

// Child appends already-sanitized segments to a relative path.
func Child(base string, segments ...string) string {
	parts := []string{strings.TrimSuffix(base, "/")}
	for _, seg := range segments {
		if seg != "" {
			parts = append(parts, seg)
		}
	}
	return strings.Join(parts, "/")
}

// Abs validates a relative path and returns its contained absolute form.
func (s *Store) Abs(rel string) (string, error) {
	if err := validateRelative(rel); err != nil {
		return "", err
	}
	abs := filepath.Join(s.root, filepath.FromSlash(rel))
	if err := s.contained(abs); err != nil {
		return "", err
	}
	return abs, nil
}

func (s *Store) contained(abs string) error {
	cleaned := filepath.Clean(abs)
	if cleaned == s.root {
		return nil
	}
	if !strings.HasPrefix(cleaned, s.root+string(os.PathSeparator)) {
		return fmt.Errorf("path escapes storage root")
	}
	return nil
}

// EnsureDir creates a directory tree without following symlinks.
func (s *Store) EnsureDir(rel string) (string, error) {
	abs, err := s.Abs(rel)
	if err != nil {
		return "", err
	}
	if err := s.walkMkdir(abs); err != nil {
		return "", err
	}
	return abs, nil
}

func (s *Store) walkMkdir(abs string) error {
	current := s.root
	relFromRoot, err := filepath.Rel(s.root, abs)
	if err != nil {
		return err
	}
	if relFromRoot == "." {
		return nil
	}
	for _, part := range strings.Split(relFromRoot, string(os.PathSeparator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		switch {
		case errors.Is(err, os.ErrNotExist):
			if err := os.Mkdir(current, 0o750); err != nil && !errors.Is(err, os.ErrExist) {
				return err
			}
		case err != nil:
			return err
		case info.Mode()&os.ModeSymlink != 0:
			return fmt.Errorf("symlink not allowed in storage path: %s", part)
		case !info.IsDir():
			return fmt.Errorf("path component is not a directory: %s", part)
		}
	}
	return nil
}

// CreateTemp opens a .part file in the destination directory so rename stays atomic.
func (s *Store) CreateTemp(rel string, itemID uuid.UUID) (*os.File, string, error) {
	abs, err := s.Abs(rel)
	if err != nil {
		return nil, "", err
	}
	if _, err := s.EnsureDir(filepath.ToSlash(filepath.Dir(rel))); err != nil {
		return nil, "", err
	}
	pattern := ".terra-" + itemID.String() + "-*.part"
	f, err := os.CreateTemp(filepath.Dir(abs), pattern)
	if err != nil {
		return nil, "", err
	}
	if err := f.Chmod(0o640); err != nil {
		_ = f.Close()
		_ = os.Remove(f.Name())
		return nil, "", err
	}
	return f, f.Name(), nil
}

// OpenRead opens a regular file and refuses symlinks.
func (s *Store) OpenRead(rel string) (*os.File, os.FileInfo, error) {
	abs, err := s.Abs(rel)
	if err != nil {
		return nil, nil, err
	}
	f, err := openNoFollow(abs)
	if err != nil {
		return nil, nil, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, nil, err
	}
	if !info.Mode().IsRegular() {
		_ = f.Close()
		return nil, nil, errors.New("not a regular file")
	}
	return f, info, nil
}

// RenameAtomic replaces nothing: it fails when the destination already exists.
func RenameAtomic(temp, abs string) error {
	if _, err := os.Lstat(abs); err == nil {
		return errors.New("destination already exists")
	}
	return os.Rename(temp, abs)
}

func (s *Store) Remove(rel string) {
	if abs, err := s.Abs(rel); err == nil {
		_ = os.Remove(abs)
	}
}

func (s *Store) FreeBytes() (int64, error) {
	return freeBytes(s.root)
}

func (s *Store) CheckFreeSpace() error {
	free, err := s.FreeBytes()
	if err != nil {
		return err
	}
	if free < s.minFree {
		return fmt.Errorf("insufficient free disk space: %d bytes available, %d required", free, s.minFree)
	}
	return nil
}

func validateRelative(rel string) error {
	if rel == "" {
		return errors.New("empty storage path")
	}
	if strings.ContainsRune(rel, 0) || strings.Contains(rel, "\\") {
		return errors.New("invalid storage path character")
	}
	if strings.HasPrefix(rel, "/") {
		return errors.New("absolute storage path rejected")
	}
	for _, part := range strings.Split(rel, "/") {
		if part == "" || part == "." || part == ".." {
			return errors.New("invalid storage path segment")
		}
		if strings.ContainsAny(part, "/\\") {
			return errors.New("invalid storage path separator")
		}
	}
	return nil
}

// Sanitize makes a single Drive name safe for the local filesystem while keeping
// it readable. Identity always comes from the Drive ID, never from this name.
func Sanitize(name string) string {
	name = strings.TrimSpace(name)
	var b strings.Builder
	for _, r := range name {
		switch {
		case r < 0x20 || r == 0x7f:
			b.WriteRune('_')
		case strings.ContainsRune(`/\<>:"|?*`, r):
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}
	out := strings.Trim(b.String(), " .")
	if out == "" {
		out = "_"
	}
	// Keep byte length bounded without splitting a UTF-8 rune.
	for len(out) > 120 {
		_, size := utf8.DecodeLastRuneInString(out)
		out = out[:len(out)-size]
	}
	if isReserved(out) {
		out = "_" + out
	}
	return out
}

func Slug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	prevDash := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		default:
			if !prevDash && b.Len() > 0 {
				b.WriteRune('-')
				prevDash = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "sin-slug"
	}
	return out
}

func isReserved(name string) bool {
	base := strings.ToUpper(strings.SplitN(name, ".", 2)[0])
	switch base {
	case "CON", "PRN", "AUX", "NUL",
		"COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
		"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9":
		return true
	}
	return false
}

// UniqueName appends a deterministic Drive-ID suffix when two items collide.
func UniqueName(used map[string]string, name, driveID string) string {
	name = Sanitize(name)
	key := strings.ToLower(name)
	if _, exists := used[key]; !exists {
		used[key] = driveID
		return name
	}
	if used[key] == driveID {
		return name
	}
	for length := 8; length <= len(driveID) && length <= 32; length += 4 {
		candidate := name + "~" + driveID[:length]
		if _, exists := used[strings.ToLower(candidate)]; !exists {
			used[strings.ToLower(candidate)] = driveID
			return candidate
		}
	}
	candidate := fmt.Sprintf("%s~%s", name, driveID)
	used[strings.ToLower(candidate)] = driveID
	return candidate
}
