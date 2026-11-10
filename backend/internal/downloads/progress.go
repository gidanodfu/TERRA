package downloads

import (
	"io"
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
)

// ProgressSnapshot es la representación agregada y persistente del avance real.
// No sustituye a los contadores históricos de download_jobs: los complementa.
type ProgressSnapshot struct {
	JobID                    uuid.UUID        `json:"job_id"`
	Stage                    string           `json:"stage"`
	Status                   string           `json:"status"`
	CompletedBytes           int64            `json:"completed_bytes"`
	InFlightBytes            int64            `json:"in_flight_bytes"`
	TransferredBytes         int64            `json:"transferred_bytes"`
	KnownTotalBytes          int64            `json:"known_total_bytes"`
	UnknownSizeItems         int              `json:"unknown_size_items"`
	ByteProgressPercent      *float64         `json:"byte_progress_percent"`
	CompletedItems           int              `json:"completed_items"`
	SkippedItems             int              `json:"skipped_items"`
	FailedItems              int              `json:"failed_items"`
	PendingItems             int              `json:"pending_items"`
	RetryingItems            int              `json:"retrying_items"`
	DownloadingItems         int              `json:"downloading_items"`
	ActiveDownloads          []ActiveDownload `json:"active_downloads"`
	DownloadSpeedBytesPerSec float64          `json:"download_speed_bytes_per_second"`
	AverageSpeedBytesPerSec  float64          `json:"average_speed_bytes_per_second"`
	ElapsedSeconds           int64            `json:"elapsed_seconds"`
	ETASeconds               *int64           `json:"eta_seconds"`
	Scan                     ScanProgress     `json:"scan"`
	UpdatedAt                time.Time        `json:"updated_at"`
}

type ActiveDownload struct {
	ItemID           uuid.UUID `json:"item_id"`
	Name             string    `json:"name"`
	TransferredBytes int64     `json:"transferred_bytes"`
	ExpectedBytes    *int64    `json:"expected_bytes,omitempty"`
	ProgressPercent  *float64  `json:"progress_percent,omitempty"`
}

type ScanProgress struct {
	FoldersDiscovered int `json:"folders_discovered"`
	FoldersScanned    int `json:"folders_scanned"`
	ItemsFound        int `json:"items_found"`
	DownloadableItems int `json:"downloadable_items"`
	SkippedItems      int `json:"skipped_items"`
	PendingItems      int `json:"pending_items"`
}

type trackedDownload struct {
	name        string
	expected    *int64
	transferred int64
}

type trackerState struct {
	inFlight        int64
	active          []ActiveDownload
	sessionDone     int64
	speed           float64
	scan            ScanProgress
	lastSample      time.Time
	lastTransferred int64
	startedAt       time.Time
}

// JobProgressTracker mantiene en memoria los bytes aceptados por el destino.
// Solo publica snapshots agregados; no escribe en PostgreSQL por cada bloque.
type JobProgressTracker struct {
	mu               sync.Mutex
	items            map[uuid.UUID]*trackedDownload
	inFlight         int64
	sessionCompleted int64
	scan             ScanProgress
	started          time.Time
	lastAt           time.Time
	lastSeen         int64
	speed            float64
	hasSample        bool
}

func NewJobProgressTracker(now time.Time) *JobProgressTracker {
	return &JobProgressTracker{
		items: make(map[uuid.UUID]*trackedDownload), started: now, lastAt: now,
	}
}

func (t *JobProgressTracker) StartItem(id uuid.UUID, name string, expected *int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.items[id] = &trackedDownload{name: name, expected: expected}
}

func (t *JobProgressTracker) AddBytes(id uuid.UUID, n int64) {
	if n <= 0 {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if item := t.items[id]; item != nil {
		item.transferred += n
		t.inFlight += n
	}
}

func (t *JobProgressTracker) FailItem(id uuid.UUID) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if item := t.items[id]; item != nil {
		t.inFlight -= item.transferred
		if t.inFlight < 0 {
			t.inFlight = 0
		}
		delete(t.items, id)
	}
}

func (t *JobProgressTracker) CompleteItem(id uuid.UUID, actual int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if item := t.items[id]; item != nil {
		t.inFlight -= item.transferred
		if t.inFlight < 0 {
			t.inFlight = 0
		}
		delete(t.items, id)
	}
	if actual > 0 {
		t.sessionCompleted += actual
	}
}

func (t *JobProgressTracker) Writer(id uuid.UUID) io.Writer {
	return progressWriter{tracker: t, id: id}
}

func (t *JobProgressTracker) FolderDiscovered() {
	t.mu.Lock()
	t.scan.FoldersDiscovered++
	t.mu.Unlock()
}

func (t *JobProgressTracker) FolderScanned() {
	t.mu.Lock()
	t.scan.FoldersScanned++
	t.mu.Unlock()
}

func (t *JobProgressTracker) ItemFound() {
	t.mu.Lock()
	t.scan.ItemsFound++
	t.mu.Unlock()
}

func (t *JobProgressTracker) DownloadableItem() {
	t.mu.Lock()
	t.scan.DownloadableItems++
	t.mu.Unlock()
}

func (t *JobProgressTracker) SkippedItem() {
	t.mu.Lock()
	t.scan.SkippedItems++
	t.mu.Unlock()
}

func (t *JobProgressTracker) Snapshot(completedBytes int64, now time.Time) trackerState {
	t.mu.Lock()
	defer t.mu.Unlock()
	active := make([]ActiveDownload, 0, len(t.items))
	for id, item := range t.items {
		var percent *float64
		if item.expected != nil && *item.expected > 0 {
			value := math.Min(100, float64(item.transferred)/float64(*item.expected)*100)
			percent = &value
		}
		expected := item.expected
		active = append(active, ActiveDownload{
			ItemID: id, Name: item.name, TransferredBytes: item.transferred,
			ExpectedBytes: expected, ProgressPercent: percent,
		})
	}
	if !t.hasSample {
		t.hasSample = true
		t.lastAt = now
		t.lastSeen = completedBytes + t.inFlight
	} else if elapsed := now.Sub(t.lastAt).Seconds(); elapsed > 0 {
		delta := (completedBytes + t.inFlight) - t.lastSeen
		if delta < 0 {
			delta = 0
		}
		instant := float64(delta) / elapsed
		if t.speed == 0 {
			t.speed = instant
		} else {
			t.speed = 0.3*instant + 0.7*t.speed
		}
		t.lastAt = now
		t.lastSeen = completedBytes + t.inFlight
	}
	return trackerState{
		inFlight: t.inFlight, active: active, sessionDone: t.sessionCompleted,
		speed: t.speed, scan: t.scan, lastSample: t.lastAt,
		lastTransferred: t.lastSeen, startedAt: t.started,
	}
}

type progressWriter struct {
	tracker *JobProgressTracker
	id      uuid.UUID
}

func (w progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	w.tracker.AddBytes(w.id, int64(n))
	return n, nil
}
