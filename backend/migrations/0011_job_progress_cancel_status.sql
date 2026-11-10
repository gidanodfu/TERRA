-- cancel_requested es un estado transitorio válido del trabajo y debe poder
-- persistirse en el snapshot de progreso antes de finalizar la cancelación.
ALTER TABLE download_job_progress DROP CONSTRAINT download_job_progress_stage_check;
ALTER TABLE download_job_progress ADD CONSTRAINT download_job_progress_stage_check CHECK (stage IN (
    'queued', 'scanning', 'downloading', 'cancel_requested', 'waiting_authorization',
    'completed', 'partially_completed', 'failed', 'cancelled'
));
