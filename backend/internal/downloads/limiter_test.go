package downloads

import (
	"context"
	"testing"
	"time"
)

func TestAccountLimiterSpacesStarts(t *testing.T) {
	l := NewAccountLimiter()
	start := time.Now()
	if err := l.Wait(context.Background(), "account", 120*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if err := l.Wait(context.Background(), "account", 120*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if elapsed := time.Since(start); elapsed < 110*time.Millisecond {
		t.Fatalf("second start was not spaced: %v", elapsed)
	}
}

func TestAccountLimiterHonorsContext(t *testing.T) {
	l := NewAccountLimiter()
	if err := l.Wait(context.Background(), "account", 500*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := l.Wait(ctx, "account", time.Second); err == nil {
		t.Fatal("cancelled wait returned nil")
	}
}

func TestBackoffGrowsAndIsCapped(t *testing.T) {
	first := backoff(1, 0)
	second := backoff(5, 0)
	if second <= first {
		t.Fatalf("backoff did not grow: %v %v", first, second)
	}
	if got := backoff(20, 0); got > 62*time.Second {
		t.Fatalf("backoff exceeded cap: %v", got)
	}
	if got := backoff(1, 90*time.Minute); got != 2*time.Minute {
		t.Fatalf("retry-after not respected/capped: %v", got)
	}
}
