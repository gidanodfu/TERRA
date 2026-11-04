# Testing

## Principles

- All tests run inside Docker (`api` and `web` containers).
- No Go, Node, npm, Vitest or Playwright installation is required on the host.
- Normal suites do not use real Google or Turnstile credentials.
- Tests never modify the development PostgreSQL database.
- Failures propagate real exit codes; no suite is reported successful if skipped.

## Directory structure

```
frontend/tests/
├── unit/
├── integration/
├── fixtures/
├── helpers/
└── e2e/

backend/tests/
├── unit/
├── integration/
├── fixtures/
└── helpers/
```

Internal Go tests also remain next to their packages, following Go conventions.

## Tools

| Area | Tool |
|---|---|
| Backend | Go `testing`, `httptest`, pgx |
| Frontend unit/integration | Vitest, React Testing Library, jsdom |
| Frontend E2E | Playwright + Chromium inside `web` |
| Integration DB | PostgreSQL container, disposable `terra_test` |
| Coverage | Go coverprofile, Vitest v8 |
| CI | GitHub Actions with Docker only |

## Commands

```bash
./terra test                  # all suites including E2E
./terra test all
./terra test unit
./terra test integration
./terra test backend
./terra test backend unit
./terra test backend integration
./terra test frontend
./terra test frontend unit
./terra test frontend integration
./terra test e2e
```

Results and coverage are written to `artifacts/` (ignored by Git).

## Backend unit tests

- Existing package tests in `backend/internal/**`.
- Exported cross-package tests in `backend/tests/unit`.
- Pure functions, validation, rate limit, error translation, permissions,
  export MIME types and state helpers.
- `go vet ./...` is also executed.

## Backend integration tests

Build tag: `integration`. Test runner:

```bash
./terra test backend integration
```

The script creates `terra_test`, passes `TEST_DATABASE_URL` to the `api` container,
runs the tests and drops the database. If the database is unavailable, the suite
fails.

Covered behavior:

- migrations and system-role seed;
- composite FK `(position, area)` integrity;
- queue claim with an active lease, heartbeat and cancellation;
- idempotency key replay;
- restricted job listing for non-admin workers;
- job events persistence;
- audit persistence;
- session CSRF validation and suspension-triggered session invalidation.

Fixtures are in `backend/tests/fixtures` (data conventions) and helpers open/reset
the disposable database. Tests are sequential and independent.

## Frontend unit tests

`frontend/tests/unit` covers:

- formatting and progress calculations;
- HTTP client, CSRF header, JSON bodies and stable API errors;
- status badges;
- SSE hook behavior with a controlled EventSource double.

## Frontend integration tests

`frontend/tests/integration` covers:

- `AuthProvider` session loading, permissions, logout and 401 handling;
- job table rendering with routing;
- profile form validation, area/position dependency and API submission.

External HTTP is mocked; no backend is required for these tests.

## E2E

`frontend/tests/e2e` uses Playwright inside the `web` container against the running
Vite dev server and its `/api` proxy. It validates:

- login page rendering and React mount in `#root`;
- Vite client and React Refresh served as JavaScript;
- source modules and CSS module responses;
- Vite proxy reaching the API;
- protected route redirect and anonymous 401;
- HMR WebSocket connection;
- Inter local, estructura visual del login y responsive móvil;
- conservación del redirect OAuth.

Chromium and dependencies are installed in the web image. No Playwright browser is
installed on the host.

## Integration coverage matrix

| Integration | Module | Type | Unit | Integration | Status |
|---|---|---|---|---|---|
| Google OAuth identity | auth | External HTTP | state/PKCE helpers | middleware/DB session | Partial: real consent is manual |
| Google Drive OAuth/API | drive | External HTTP | MIME/export/classification | queue with DB fixtures | Partial: real Drive is manual |
| Turnstile Siteverify | auth | External HTTP | httptest success/failure/action/host | — | Unit covered |
| PostgreSQL queue | downloads | DB | limiter/backoff | claim/lease/cancel/idempotency | Covered |
| Organization integrity | organization/users | DB | slug/normalization | composite FK | Covered |
| Sessions/CSRF | auth | DB + HTTP | token helpers | httptest + DB | Covered |
| Audit | audit | DB | — | record/list | Covered |
| Vite client / React mount / HMR | frontend | HTTP + browser | HTTP client | Playwright (9 E2E) | Covered |
| SSE | downloads/API | HTTP | client hook | browser/proxy smoke | Partial |
| Vite proxy | frontend | HTTP | HTTP client | Playwright | Covered |
| Local storage | storage | Filesystem | sanitization/atomic tests | consistency check | Covered |

External real integrations require explicit credentials and are not part of the
default CI. They must never be reported as verified when only mocks were used.

## Adding a new integration

1. Add unit tests for its pure logic and error handling.
2. Add a controlled HTTP server (`httptest`/mock) for normal integration tests.
3. Add fixtures/helpers and never use personal credentials.
4. Cover success, timeout, 401/403, 429, malformed responses and retries as applicable.
5. Add an opt-in external test documented separately if real credentials are needed.
6. Update the matrix and the command documentation.

## Coverage

- Backend: `artifacts/coverage/backend-unit.out` and `backend-integration.out`.
- Frontend: `artifacts/coverage/frontend/`.
- E2E report: `artifacts/playwright-report/`.

## Debugging failed tests

```bash
./terra logs api
./terra logs web
./terra shell api
./terra shell web
docker compose exec -T web npx vitest run tests/unit --reporter=verbose
docker compose exec -T api go test -tags=integration -v ./tests/integration/...
```

No test may delete the development database or the document volume.
