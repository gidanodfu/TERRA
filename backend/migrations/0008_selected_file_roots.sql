-- Selección mixta: raíces de archivo individuales dentro del mismo trabajo.
ALTER TABLE download_jobs DROP CONSTRAINT IF EXISTS download_jobs_scope_type_check;
ALTER TABLE download_jobs ADD CONSTRAINT download_jobs_scope_type_check
    CHECK (scope_type IN ('my_drive_full', 'selected_folders', 'selected_items'));

CREATE TABLE download_job_file_roots (
    id                    uuid PRIMARY KEY,
    job_id                uuid NOT NULL REFERENCES download_jobs (id) ON DELETE CASCADE,
    google_file_id        text NOT NULL,
    file_name_snapshot    text NOT NULL,
    source_path_snapshot  text NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT download_job_file_roots_unique UNIQUE (job_id, google_file_id)
);
