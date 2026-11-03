# Worker development

The worker is an independent container using the same backend image as the API.

## Start and inspect

```bash
./terra up
./terra logs worker -f
./terra status
```

Command: `go run ./cmd/worker`.
It claims jobs from PostgreSQL with `FOR UPDATE ... SKIP LOCKED`, maintains a lease
and heartbeat, scans Drive, downloads or exports files, writes atomically, and
updates progress.

## Edits

The backend source is bind-mounted. Restart only the worker after backend changes:

```bash
./terra restart worker
```

or rebuild/start:

```bash
./terra build api
./terra up
```

## Queue checks

```bash
./terra db -c "SELECT status, count(*) FROM download_jobs GROUP BY status;"
./terra db -c "SELECT id, status, attempt_count, error_code FROM download_items ORDER BY started_at DESC LIMIT 20;"
./terra db -c "SELECT max(heartbeat_at) FROM download_jobs;"
```

## Cancellation and leases

- Cancellation is requested through the API and observed by the heartbeat.
- Expired leases can be reclaimed after a worker restart.
- A lost lease does not finalize the job; the new owner resumes it.
- Completed items are not downloaded again.

## Tests

Worker queue behavior is covered by backend integration tests:

```bash
./terra test backend integration
```

The tests validate claim exclusivity, heartbeat, cancellation, idempotency and
restricted job listing against PostgreSQL. Drive HTTP itself is not contacted by
these tests; external Drive tests require controlled credentials and are manual.

## Storage

The worker mounts the local document path read/write:

```text
../data/dev → /var/lib/terra
```

The API mounts it read-only.
