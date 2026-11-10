package downloads

import (
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestProgressWriterAggregatesConcurrentTransfers(t *testing.T) {
	tracker := NewJobProgressTracker(time.Now())
	first, second := uuid.New(), uuid.New()
	firstSize, secondSize := int64(100), int64(50)
	tracker.StartItem(first, "uno.bin", &firstSize)
	tracker.StartItem(second, "dos.bin", &secondSize)

	var wg sync.WaitGroup
	for _, id := range []uuid.UUID{first, second} {
		wg.Add(1)
		go func(itemID uuid.UUID) {
			defer wg.Done()
			writer := tracker.Writer(itemID)
			for i := 0; i < 10; i++ {
				if n, err := writer.Write(make([]byte, 5)); err != nil || n != 5 {
					t.Errorf("escritura: n=%d err=%v", n, err)
					return
				}
			}
		}(id)
	}
	wg.Wait()

	state := tracker.Snapshot(0, time.Now())
	if state.inFlight != 100 {
		t.Fatalf("bytes en vuelo=%d", state.inFlight)
	}
	if len(state.active) != 2 {
		t.Fatalf("transferencias activas=%d", len(state.active))
	}
	for _, item := range state.active {
		if item.ProgressPercent == nil {
			t.Fatalf("porcentaje individual ausente: %+v", item)
		}
	}

	tracker.FailItem(first)
	state = tracker.Snapshot(0, time.Now())
	if state.inFlight != 50 || len(state.active) != 1 {
		t.Fatalf("fallo no eliminó bytes parciales: %+v", state)
	}

	tracker.CompleteItem(second, 50)
	state = tracker.Snapshot(0, time.Now())
	if state.inFlight != 0 || len(state.active) != 0 {
		t.Fatalf("finalización dejó bytes en vuelo: %+v", state)
	}
}

func TestProgressUnknownSizeHasNoPercent(t *testing.T) {
	tracker := NewJobProgressTracker(time.Now())
	id := uuid.New()
	tracker.StartItem(id, "desconocido.bin", nil)
	_, _ = tracker.Writer(id).Write(make([]byte, 25))
	state := tracker.Snapshot(0, time.Now())
	if len(state.active) != 1 || state.active[0].ProgressPercent != nil {
		t.Fatalf("un tamaño desconocido no debe inventar porcentaje: %+v", state.active)
	}
	if state.scan.FoldersScanned != 0 {
		t.Fatalf("escaneo inesperado: %+v", state.scan)
	}
}
