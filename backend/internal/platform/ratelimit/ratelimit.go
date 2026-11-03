// Package ratelimit provides in-process sliding-window limits. The API runs as a
// single container, so a shared store is not required; limits reset on restart.
package ratelimit

import (
	"sync"
	"time"
)

type window struct {
	start time.Time
	count int
}

type Limiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	entries map[string]*window
}

func New(limit int, per time.Duration) *Limiter {
	return &Limiter{limit: limit, window: per, entries: make(map[string]*window)}
}

func (l *Limiter) Allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	entry, ok := l.entries[key]
	if !ok || now.Sub(entry.start) >= l.window {
		l.entries[key] = &window{start: now, count: 1}
		return true
	}
	if entry.count >= l.limit {
		return false
	}
	entry.count++
	return true
}

// Cleanup drops expired windows; call periodically from a goroutine.
func (l *Limiter) Cleanup() {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, e := range l.entries {
		if now.Sub(e.start) >= l.window {
			delete(l.entries, k)
		}
	}
}

func (l *Limiter) StartCleanupEvery(d time.Duration, stop <-chan struct{}) {
	go func() {
		t := time.NewTicker(d)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				l.Cleanup()
			case <-stop:
				return
			}
		}
	}()
}
