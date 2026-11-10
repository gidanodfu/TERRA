// El paquete realtime mantiene una única superficie WebSocket para trabajos y dashboard.
// PostgreSQL sigue siendo la fuente de verdad: las notificaciones solo señalan qué leer.
package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"

	"terra/internal/platform/principal"
)

const (
	queueSize        = 64
	maxSubscriptions = 40
	writeTimeout     = 5 * time.Second
)

type Message struct {
	Type     string    `json:"type"`
	Revision int64     `json:"revision,omitempty"`
	EventID  int64     `json:"event_id,omitempty"`
	At       time.Time `json:"at"`
	Data     any       `json:"data,omitempty"`
}

type Client struct {
	conn     *websocket.Conn
	send     chan Message
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	subs     map[string]bool
	closed   bool
	closeOne sync.Once
	identity principal.Identity
}

func newClient(parent context.Context, conn *websocket.Conn) *Client {
	ctx, cancel := context.WithCancel(parent)
	return &Client{conn: conn, send: make(chan Message, queueSize), ctx: ctx, cancel: cancel, subs: map[string]bool{}}
}

func (c *Client) subscriptionCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.subs)
}

func (c *Client) addSubscription(channel string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.subs[channel] {
		return true
	}
	if len(c.subs) >= maxSubscriptions {
		return false
	}
	c.subs[channel] = true
	return true
}

func (c *Client) removeSubscription(channel string) {
	c.mu.Lock()
	delete(c.subs, channel)
	c.mu.Unlock()
}

func (c *Client) subscribed(channel string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.subs[channel]
}

func (c *Client) enqueue(message Message) bool {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return false
	}
	select {
	case c.send <- message:
		c.mu.Unlock()
		return true
	default:
		c.mu.Unlock()
		c.close()
		return false
	}
}

func (c *Client) close() {
	c.closeOne.Do(func() {
		c.mu.Lock()
		c.closed = true
		c.mu.Unlock()
		c.cancel()
	})
}

func (c *Client) writeLoop(log *slog.Logger) {
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-c.ctx.Done():
			_ = c.conn.Close(websocket.StatusNormalClosure, "closed")
			return
		case message := <-c.send:
			raw, err := json.Marshal(message)
			if err != nil {
				continue
			}
			writeCtx, cancel := context.WithTimeout(c.ctx, writeTimeout)
			err = c.conn.Write(writeCtx, websocket.MessageText, raw)
			cancel()
			if err != nil {
				log.Debug("realtime_write_failed", "error", err)
				c.close()
				return
			}
		case <-ping.C:
			pingCtx, cancel := context.WithTimeout(c.ctx, writeTimeout)
			err := c.conn.Ping(pingCtx)
			cancel()
			if err != nil {
				c.close()
				return
			}
		}
	}
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
}

func NewHub() *Hub { return &Hub{clients: map[*Client]bool{}} }

func (h *Hub) Add(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
}

func (h *Hub) Remove(c *Client) {
	c.close()
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

// Broadcast entrega a cada cliente suscrito. Si la cola está llena, cierra la
// conexión: el cliente reconectará y recuperará el snapshot persistido.
func (h *Hub) CloseAll() {
	h.mu.Lock()
	clients := make([]*Client, 0, len(h.clients))
	for client := range h.clients {
		clients = append(clients, client)
	}
	h.clients = map[*Client]bool{}
	h.mu.Unlock()
	for _, client := range clients {
		client.close()
	}
}

func (h *Hub) Clients(channel string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	clients := make([]*Client, 0, len(h.clients))
	for client := range h.clients {
		if client.subscribed(channel) {
			clients = append(clients, client)
		}
	}
	return clients
}

func (h *Hub) Broadcast(channel string, message Message) {
	for _, client := range h.Clients(channel) {
		client.enqueue(message)
	}
}

func channelForJob(jobID uuid.UUID) string { return "job:" + jobID.String() }

func parseJobChannel(channel string) (uuid.UUID, bool) {
	if !strings.HasPrefix(channel, "job:") {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(strings.TrimPrefix(channel, "job:"))
	return id, err == nil
}
