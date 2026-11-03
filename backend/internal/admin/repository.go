package admin

import (
	"context"
)

func (s *Service) queryDashboard(ctx context.Context, d *Dashboard) error {
	return s.poolRef().QueryRow(ctx, `SELECT
		(SELECT count(*) FROM users WHERE status='active'),
		(SELECT count(*) FROM users WHERE status='pending_profile'),
		(SELECT count(*) FROM users WHERE status='suspended'),
		(SELECT count(*) FROM areas),
		(SELECT count(*) FROM positions),
		(SELECT count(*) FROM download_jobs WHERE status='queued'),
		(SELECT count(*) FROM download_jobs WHERE status IN ('scanning','downloading','cancel_requested')),
		(SELECT count(*) FROM download_jobs WHERE status='waiting_authorization'),
		(SELECT count(*) FROM download_jobs WHERE status='completed'),
		(SELECT count(*) FROM download_jobs WHERE status IN ('failed','partially_completed')),
		(SELECT COALESCE(sum(size_bytes),0) FROM stored_files),
		(SELECT count(*) FROM drive_connections WHERE status='connected'),
		(SELECT count(*) FROM drive_connections WHERE status='reauthorization_required'),
		COALESCE((SELECT EXTRACT(EPOCH FROM now() - min(created_at))::bigint FROM download_jobs
			WHERE status IN ('queued','waiting_authorization')), 0)`,
	).Scan(&d.ActiveUsers, &d.PendingProfiles, &d.SuspendedUsers, &d.Areas, &d.Positions,
		&d.QueuedJobs, &d.RunningJobs, &d.WaitingAuthJobs, &d.CompletedJobs, &d.FailedJobs,
		&d.StoredBytes, &d.ConnectedDrives, &d.ReauthDrives, &d.OldestQueueAgeSec)
}
