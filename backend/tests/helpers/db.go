// El paquete helpers proporciona fixtures PostgreSQL aislados para las pruebas de integración del backend.
package helpers

import (
	"context"
	"net"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"terra/internal/platform/db"
	"terra/internal/platform/migrate"
	"terra/migrations"
)

// testDatabaseURL usa TEST_DATABASE_URL cuando existe (compatibilidad) o construye
// el DSN desde las variables POSTGRES_* y el nombre de la base de pruebas.
func testDatabaseURL() string {
	if value := os.Getenv("TEST_DATABASE_URL"); value != "" {
		return value
	}
	name := os.Getenv("TEST_DATABASE_NAME")
	user := os.Getenv("POSTGRES_USER")
	password := os.Getenv("POSTGRES_PASSWORD")
	if name == "" || user == "" || password == "" {
		return ""
	}
	host := os.Getenv("DATABASE_HOST")
	if host == "" {
		host = "db"
	}
	port := os.Getenv("DATABASE_PORT")
	if port == "" {
		port = "5432"
	}
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(user, password),
		Host:     net.JoinHostPort(host, port),
		Path:     "/" + name,
		RawQuery: "sslmode=disable",
	}
	return u.String()
}

// Pool abre TEST_DATABASE_URL, aplica las migraciones y parte de un esquema vacío.
// El runner de pruebas crea y destruye la base desechable; los datos de desarrollo nunca se usan.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := testDatabaseURL()
	if url == "" {
		t.Fatal("TEST_DATABASE_URL o TEST_DATABASE_NAME no están definidas; ejecute ./terra test backend integration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Fatalf("no se pudo abrir la base de pruebas: %v", err)
	}
	t.Cleanup(pool.Close)
	if _, err := migrate.Up(ctx, pool, migrations.FS); err != nil {
		t.Fatalf("migraciones en base de pruebas: %v", err)
	}
	Reset(t, pool)
	return pool
}

func Reset(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `TRUNCATE TABLE
		job_events, download_items, stored_files, download_job_file_roots, download_job_roots, download_jobs,
		drive_node_parents, drive_nodes, drive_connections, sessions, oauth_states,
		local_credentials, user_roles, auth_identities, organization_history,
		audit_events, policy_versions, bootstrap_state, users, positions, areas
		RESTART IDENTITY CASCADE`)
	if err != nil {
		t.Fatalf("reset de base de pruebas: %v", err)
	}
}

func SeedOrganization(t *testing.T, pool *pgxpool.Pool, areaName, positionName string) (uuid.UUID, uuid.UUID) {
	t.Helper()
	areaID, positionID := uuid.New(), uuid.New()
	slug := uuid.NewString()[:12]
	if _, err := pool.Exec(context.Background(), `INSERT INTO areas (id,name,slug,status) VALUES ($1,$2,$3,'active')`,
		areaID, areaName, "area-"+slug); err != nil {
		t.Fatalf("seed area: %v", err)
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO positions
		(id,area_id,name,slug,normalized_name,status) VALUES ($1,$2,$3,$4,$5,'active')`,
		positionID, areaID, positionName, "cargo-"+slug, positionName); err != nil {
		t.Fatalf("seed position: %v", err)
	}
	return areaID, positionID
}

func SeedUser(t *testing.T, pool *pgxpool.Pool, areaID, positionID uuid.UUID, status string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	if _, err := pool.Exec(context.Background(), `INSERT INTO users
		(id,first_name,last_name,display_name,email,area_id,position_id,status)
		VALUES ($1,'Test','User',$2,$3,$4,$5,$6)`,
		id, "User "+id.String()[:8], "user-"+id.String()+"@example.test", areaID, positionID, status); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO auth_identities (id,user_id,provider,provider_subject)
		VALUES ($1,$2,'google',$3)`, uuid.New(), id, "subject-"+id.String()); err != nil {
		t.Fatalf("seed identity: %v", err)
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO user_roles (user_id,role_id)
		SELECT $1,id FROM system_roles WHERE key='user'`, id); err != nil {
		t.Fatalf("seed role: %v", err)
	}
	return id
}

func SeedPolicy(t *testing.T, pool *pgxpool.Pool, version string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `INSERT INTO policy_versions (id,version,content)
		VALUES ($1,$2,'Política de integración local')`, uuid.New(), version); err != nil {
		t.Fatalf("seed policy: %v", err)
	}
}

func SeedConnection(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID, policyVersion string) uuid.UUID {
	t.Helper()
	id := uuid.New()
	if _, err := pool.Exec(context.Background(), `INSERT INTO drive_connections
		(id,user_id,google_subject,google_email,scopes,status,policy_consent_version,policy_consent_at,policy_consent_by_user_id)
		VALUES ($1,$2,$3,$4,'https://www.googleapis.com/auth/drive.readonly','connected',$5,now(),$2)`,
		id, userID, "subject-"+userID.String(), "drive-"+userID.String()+"@example.test", policyVersion); err != nil {
		t.Fatalf("seed connection: %v", err)
	}
	return id
}
