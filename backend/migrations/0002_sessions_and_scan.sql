-- Worker scan checkpoint and mandatory session invalidation on account deactivation.

ALTER TABLE download_jobs ADD COLUMN scan_completed_at timestamptz;

CREATE INDEX download_jobs_waiting_idx ON download_jobs (status, created_at)
    WHERE status = 'waiting_authorization';

CREATE OR REPLACE FUNCTION terra_invalidate_user_sessions() RETURNS trigger AS $$
BEGIN
    IF NEW.status IN ('suspended', 'disabled') AND OLD.status IS DISTINCT FROM NEW.status THEN
        DELETE FROM sessions WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_invalidate_sessions ON users;
CREATE TRIGGER users_invalidate_sessions
    AFTER UPDATE OF status ON users
    FOR EACH ROW EXECUTE FUNCTION terra_invalidate_user_sessions();
