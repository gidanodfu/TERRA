//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/audit"
	"terra/internal/auth"
	"terra/internal/downloads"
	"terra/internal/platform/config"
	"terra/internal/platform/crypto"
	"terra/internal/realtime"
	"terra/internal/storage"
	"terra/internal/users"
	"terra/tests/helpers"
)

func TestRealtimeAuthenticatesAndAuthorizesChannels(t *testing.T) {
	pool := helpers.Pool(t)
	areaID, positionID := helpers.SeedOrganization(t, pool, "Área Tiempo Real", "Cargo Tiempo Real")
	adminID := seedRealtimeAdmin(t, pool, areaID, positionID)
	workerID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	otherID := helpers.SeedUser(t, pool, areaID, positionID, "active")
	helpers.SeedPolicy(t, pool, "2026-11")
	connID := helpers.SeedConnection(t, pool, workerID, "2026-11")
	otherConnID := helpers.SeedConnection(t, pool, otherID, "2026-11")

	ctx := context.Background()
	usersRepo := users.NewRepository(pool)
	authRepo := auth.NewRepository(pool)
	downloadRepo := downloads.NewRepository(pool)
	store, err := storage.New(t.TempDir(), 1)
	if err != nil {
		t.Fatal(err)
	}
	downloadSvc := downloads.NewService(config.Config{}, downloadRepo, nil, usersRepo, store, audit.NewRepository(pool))
	cfg := config.Config{PublicURL: "http://localhost:8080", SessionCookie: "terra_session", SessionTTL: time.Hour}
	svc := realtime.NewService(cfg, slog.Default(), pool, downloadSvc, downloadRepo, authRepo, usersRepo,
		func(context.Context, bool) (any, error) { return map[string]any{"queued_jobs": 3}, nil })

	handler := httptest.NewServer(http.HandlerFunc(svc.ServeHTTP))
	defer handler.Close()
	wsURL := "ws" + strings.TrimPrefix(handler.URL, "http") + "/api/v1/realtime"

	workerSession := createRealtimeSession(t, authRepo, workerID, "worker-token")
	adminSession := createRealtimeSession(t, authRepo, adminID, "admin-token")

	workerConn := dialRealtime(t, wsURL, "terra_session="+workerSession)
	defer workerConn.Close(websocket.StatusNormalClosure, "test")
	readRealtimeType(t, workerConn, "connection.ready")
	writeRealtime(t, workerConn, map[string]any{"type": "subscribe", "channel": "admin.dashboard"})
	message := readRealtime(t, workerConn)
	if message.Type != "realtime.error" {
		t.Fatalf("el trabajador recibió dashboard: %s", message.Type)
	}

	adminConn := dialRealtime(t, wsURL, "terra_session="+adminSession)
	defer adminConn.Close(websocket.StatusNormalClosure, "test")
	readRealtimeType(t, adminConn, "connection.ready")
	writeRealtime(t, adminConn, map[string]any{"type": "subscribe", "channel": "admin.dashboard"})
	message = readRealtime(t, adminConn)
	if message.Type != "dashboard.snapshot" {
		t.Fatalf("dashboard no autorizado: %s", message.Type)
	}

	job, _, err := downloadRepo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: workerID, DriveOwnerUserID: workerID,
		DriveConnectionID: connID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Tiempo Real", PositionName: "Cargo Tiempo Real", AreaSlug: "area-tiempo-real",
		PositionSlug: "cargo-tiempo-real", ScopeType: downloads.ScopeMyDriveFull,
		IdempotencyKey: "realtime-own",
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	otherJob, _, err := downloadRepo.Create(ctx, &downloads.Job{
		ID: uuid.New(), RequestedByUserID: otherID, DriveOwnerUserID: otherID,
		DriveConnectionID: otherConnID, AreaID: areaID, PositionID: positionID,
		AreaName: "Área Tiempo Real", PositionName: "Cargo Tiempo Real", AreaSlug: "area-tiempo-real",
		PositionSlug: "cargo-tiempo-real", ScopeType: downloads.ScopeMyDriveFull,
		IdempotencyKey: "realtime-other",
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	writeRealtime(t, workerConn, map[string]any{"type": "subscribe", "channel": "job:" + job.ID.String()})
	message = readRealtime(t, workerConn)
	if message.Type != "job.snapshot" {
		t.Fatalf("snapshot propio no recibido: %s", message.Type)
	}
	writeRealtime(t, workerConn, map[string]any{"type": "subscribe", "channel": "job:" + otherJob.ID.String()})
	message = readRealtime(t, workerConn)
	if message.Type != "realtime.error" {
		t.Fatalf("acceso a trabajo ajeno permitido: %s", message.Type)
	}
}

func createRealtimeSession(t *testing.T, repo *auth.Repository, userID uuid.UUID, token string) string {
	t.Helper()
	_, err := repo.CreateSession(context.Background(), userID, crypto.HashToken(token), "csrf",
		time.Now().Add(time.Hour), "realtime-test", "ip")
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func dialRealtime(t *testing.T, url, cookie string) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{HTTPHeader: http.Header{
		"Cookie": {cookie},
		"Origin": {"http://localhost:8080"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	return conn
}

func writeRealtime(t *testing.T, conn *websocket.Conn, value any) {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := conn.Write(ctx, websocket.MessageText, raw); err != nil {
		t.Fatal(err)
	}
}

func readRealtime(t *testing.T, conn *websocket.Conn) realtime.Message {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, raw, err := conn.Read(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var message realtime.Message
	if err := json.Unmarshal(raw, &message); err != nil {
		t.Fatal(err)
	}
	return message
}

func readRealtimeType(t *testing.T, conn *websocket.Conn, want string) realtime.Message {
	t.Helper()
	message := readRealtime(t, conn)
	if message.Type != want {
		t.Fatalf("mensaje=%s, se esperaba %s", message.Type, want)
	}
	return message
}

func seedRealtimeAdmin(t *testing.T, pool *pgxpool.Pool, areaID, positionID uuid.UUID) uuid.UUID {
	t.Helper()
	id := helpers.SeedUser(t, pool, areaID, positionID, "active")
	if _, err := pool.Exec(context.Background(), `INSERT INTO user_roles (user_id, role_id)
		SELECT $1, id FROM system_roles WHERE key='admin' ON CONFLICT DO NOTHING`, id); err != nil {
		t.Fatal(err)
	}
	return id
}
