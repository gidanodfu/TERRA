# Continuous integration

## Workflow

`.github/workflows/ci.yml` validates code quality with GitHub Actions.

Triggers:

- push;
- pull request;
- manual `workflow_dispatch`.

It runs on `ubuntu-latest` with `contents: read` permissions and a concurrency group
that cancels superseded runs on the same ref. Checkout uses
`persist-credentials: false`.

## Stages

1. Checkout.
2. Verify required repository structure.
3. Generate a controlled local `.env` from `.env.example` with fictitious values.
4. `./terra check`.
5. `./terra build`.
6. `./terra init`.
7. `./terra test all`.
8. On failure: status, doctor and logs saved to `artifacts/`.
9. Upload `artifacts/` (tests, coverage, Playwright report, diagnostics).
10. Stop containers with `./terra down --remove` (no volume deletion).

## Docker-only

No setup action installs Go, Node, npm or PostgreSQL on the runner. All compilation,
tests and browsers run inside the Compose images. The workflow delegates to `./terra`
so CI and local development share the same commands.

## Tests executed

- Backend unit and `go vet`.
- Backend integration against disposable `terra_test`.
- Frontend lint.
- Frontend unit.
- Frontend integration.
- Frontend coverage.
- Frontend build.
- Playwright E2E against Vite and its API proxy.

Any failing suite fails the job. A suite that cannot run is a failure, not a skip.

## Credentials

The workflow contains only fictitious values for Google and Turnstile. Normal tests
never call those external services. Real OAuth/Drive tests remain manual and require
credentials outside the repository. No secrets are printed or committed.

## Artifacts

`artifacts/` contains:

- `artifacts/tests/*.log`
- `artifacts/coverage/backend-*.out`
- `artifacts/coverage/frontend/`
- `artifacts/playwright-report/`
- failure diagnostics (`ci-status.txt`, `ci-doctor.txt`, `ci-logs.txt`)

Download them from the workflow run page in GitHub Actions.

## Docker context and Git metadata

`backend/.dockerignore` and `frontend/.dockerignore` exclude `.git`, `.github`,
caches, `node_modules`, `dist`, coverage and test reports. The images do not contain
Git history or credentials. Containers receive only the source directories needed
for development through bind mounts; the repository root (and `.git`) is not mounted
into any service.

## Extending CI

Add validation as a new step that delegates to `./terra` or to an existing script.
Do not install language runtimes on the runner and do not add deployment jobs.
Update this document when a stage changes.

## Local reproduction

```bash
./terra check
./terra build
./terra init
./terra test all
./terra down --remove
```

## Limitations

The workflow can only be fully executed on GitHub Actions with Docker available.
Local validation covers the same commands; remote execution should be confirmed from
the Actions run page.
