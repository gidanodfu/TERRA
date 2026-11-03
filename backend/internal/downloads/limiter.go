package downloads

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// AccountLimiter spaces download starts per Drive connection across every job in
// the worker process. A per-goroutine sleep would allow the shared quota to be
// exceeded when several items run concurrently.
type AccountLimiter struct {
	mu   sync.Mutex
	next map[string]time.Time
}

func NewAccountLimiter() *AccountLimiter {
	return &AccountLimiter{next: make(map[string]time.Time)}
}

func (l *AccountLimiter) Wait(ctx context.Context, key string, gap time.Duration) error {
	if gap <= 0 {
		return nil
	}
	l.mu.Lock()
	now := time.Now()
	at := l.next[key]
	if at.Before(now) {
		at = now
	}
	l.next[key] = at.Add(gap)
	l.mu.Unlock()

	delay := time.Until(at)
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (l *AccountLimiter) Forget(key string) {
	l.mu.Lock()
	delete(l.next, key)
	l.mu.Unlock()
}

func backoff(attempt int, retryAfter time.Duration) time.Duration {
	if retryAfter > 0 {
		if retryAfter > 2*time.Minute {
			return 2 * time.Minute
		}
		return retryAfter
	}
	d := time.Duration(1<<min(attempt, 6)) * time.Second
	if d > 60*time.Second {
		d = 60 * time.Second
	}
	return d + time.Duration(500+time.Now().UnixNano()%1500)*time.Millisecond
}

func describeError(code string) string {
	switch code {
	case "drive_rate_limited":
		return "Google Drive limitó temporalmente las descargas; se reintentará."
	case "drive_reauthorization_required", "drive_unauthorized":
		return "El trabajador debe reconectar su cuenta de Google Drive."
	case "not_downloadable":
		return "El archivo no permite descarga."
	case "unsupported_google_type":
		return "Formato nativo de Google no soportado en esta versión."
	case "size_limit_exceeded":
		return "El archivo supera el límite de tamaño configurado."
	default:
		return fmt.Sprintf("Error de descarga (%s).", code)
	}
}
