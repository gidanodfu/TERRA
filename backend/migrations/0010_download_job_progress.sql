-- Snapshot agregado de progreso por trabajo. PostgreSQL es la fuente de verdad;
-- las actualizaciones frecuentes se escriben con UPSERT y no generan job_events.
CREATE TABLE download_job_progress (
    job_id      uuid PRIMARY KEY REFERENCES download_jobs (id) ON DELETE CASCADE,
    revision    bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    stage       text NOT NULL DEFAULT 'queued' CHECK (stage IN (
        'queued', 'scanning', 'downloading', 'cancel_requested', 'waiting_authorization',
        'completed', 'partially_completed', 'failed', 'cancelled'
    )),
    snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX download_job_progress_updated_idx ON download_job_progress (updated_at DESC);
