package realtime

import (
	"context"
	"testing"
	"time"
)

func TestHubDeliversOnlyToSubscribedClients(t *testing.T) {
	hub := NewHub()
	first := newClient(context.Background(), nil)
	second := newClient(context.Background(), nil)
	first.addSubscription("job:one")
	hub.Add(first)
	hub.Add(second)

	hub.Broadcast("job:one", Message{Type: "job.progress", At: time.Now()})
	select {
	case message := <-first.send:
		if message.Type != "job.progress" {
			t.Fatalf("mensaje inesperado: %s", message.Type)
		}
	default:
		t.Fatal("el suscriptor no recibió el mensaje")
	}
	select {
	case <-second.send:
		t.Fatal("un cliente no suscrito recibió el mensaje")
	default:
	}

	first.removeSubscription("job:one")
	hub.Broadcast("job:one", Message{Type: "job.done", At: time.Now()})
	select {
	case <-first.send:
		t.Fatal("el mensaje llegó tras desuscribirse")
	default:
	}
}

func TestEventTypeMapping(t *testing.T) {
	cases := map[string]string{
		"item.completed": "job.item.completed",
		"item.failed":    "job.item.failed",
		"job.done":       "job.done",
		"job.scanned":    "job.stage",
		"job.queued":     "job.stage",
		"job.progress":   "job.progress",
	}
	for source, want := range cases {
		if got := eventType(source); got != want {
			t.Fatalf("%s: got=%s want=%s", source, got, want)
		}
	}
}
