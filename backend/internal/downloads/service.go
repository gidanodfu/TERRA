package downloads

import (
	"context"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/drive"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/storage"
	"terra/internal/users"
)

type Service struct {
	cfg   config.Config
	repo  *Repository
	drive *drive.Service
	users *users.Repository
	store *storage.Store
	audit *audit.Repository
}

func NewService(cfg config.Config, repo *Repository, driveSvc *drive.Service, usersRepo *users.Repository,
	store *storage.Store, auditRepo *audit.Repository) *Service {
	return &Service{cfg: cfg, repo: repo, drive: driveSvc, users: usersRepo, store: store, audit: auditRepo}
}

type CreateInput struct {
	ScopeType     string   `json:"scope_type"`
	RootFolderIDs []string `json:"root_folder_ids"`
}

// Create validates authorization, scope, capacity, connection and policy, then
// enqueues the job. It never downloads anything inside the HTTP request.
func (s *Service) Create(ctx context.Context, actorID, ownerID uuid.UUID, in CreateInput,
	idempotencyKey, ipHash string) (*Job, bool, error) {
	if in.ScopeType != ScopeMyDriveFull && in.ScopeType != ScopeSelectedFolders {
		return nil, false, apperr.Invalid("Modalidad de descarga inválida.",
			map[string]string{"scope_type": "Use my_drive_full o selected_folders."})
	}
	if in.ScopeType == ScopeMyDriveFull && len(in.RootFolderIDs) > 0 {
		return nil, false, apperr.Invalid("Mi unidad completa no acepta carpetas seleccionadas.", nil)
	}
	if in.ScopeType == ScopeSelectedFolders && len(in.RootFolderIDs) == 0 {
		return nil, false, apperr.Invalid("Seleccione al menos una carpeta.",
			map[string]string{"root_folder_ids": "Seleccione al menos una carpeta."})
	}
	// A repeated request returns the original job even if the connection changed
	// since the first attempt.
	if existing, err := s.repo.GetByIdempotency(ctx, actorID, strings.TrimSpace(idempotencyKey)); err != nil {
		return nil, false, err
	} else if existing != nil {
		return existing, false, nil
	}
	owner, err := s.users.GetByID(ctx, ownerID)
	if err != nil {
		return nil, false, err
	}
	if owner.Status != users.StatusActive {
		return nil, false, apperr.Conflict("user_not_active", "El trabajador seleccionado no está activo.")
	}
	if owner.AreaID == nil || owner.PositionID == nil {
		return nil, false, apperr.Conflict("user_without_classification",
			"El trabajador no tiene área y cargo asignados.")
	}

	conn, err := s.drive.EnsureReadyForUser(ctx, ownerID)
	if err != nil {
		return nil, false, err
	}

	var roots []drive.Root
	if in.ScopeType == ScopeSelectedFolders {
		roots, err = s.drive.NormalizeRoots(ctx, ownerID, in.RootFolderIDs)
		if err != nil {
			return nil, false, err
		}
	}

	activeGlobal, err := s.repo.CountActive(ctx)
	if err != nil {
		return nil, false, err
	}
	if activeGlobal >= s.cfg.Limits.MaxActiveJobsGlobal {
		return nil, false, apperr.Conflict("capacity_active_jobs",
			"El sistema alcanzó el máximo de trabajos activos. Intente más tarde.")
	}
	activeUser, err := s.repo.CountActiveForUser(ctx, ownerID)
	if err != nil {
		return nil, false, err
	}
	if activeUser >= s.cfg.Limits.MaxActiveJobsPerUser {
		return nil, false, apperr.Conflict("capacity_active_jobs_user",
			"El trabajador ya tiene el máximo de trabajos activos permitidos.")
	}
	userBytes, err := s.repo.UserStorageBytes(ctx, ownerID)
	if err != nil {
		return nil, false, err
	}
	if userBytes >= s.cfg.Limits.MaxUserStorageBytes {
		return nil, false, apperr.Conflict("capacity_user_storage",
			"El almacenamiento del trabajador alcanzó el límite configurado.")
	}
	areaBytes, err := s.repo.AreaStorageBytes(ctx, *owner.AreaID)
	if err != nil {
		return nil, false, err
	}
	if areaBytes >= s.cfg.Limits.MaxAreaStorageBytes {
		return nil, false, apperr.Conflict("capacity_area_storage",
			"El almacenamiento del área alcanzó el límite configurado.")
	}
	if err := s.store.CheckFreeSpace(); err != nil {
		return nil, false, apperr.Conflict("capacity_disk", "El servidor no tiene espacio libre suficiente.")
	}

	job := &Job{
		ID: uuid.New(), RequestedByUserID: actorID, DriveOwnerUserID: ownerID,
		DriveConnectionID: conn.ID, AreaID: *owner.AreaID, PositionID: *owner.PositionID,
		AreaName: owner.AreaName, PositionName: owner.PositionName,
		AreaSlug: owner.AreaSlug, PositionSlug: owner.PositionSlug,
		ScopeType: in.ScopeType, IdempotencyKey: strings.TrimSpace(idempotencyKey),
	}
	var jobRoots []Root
	for _, r := range roots {
		jobRoots = append(jobRoots, Root{GoogleFolderID: r.GoogleID, FolderName: r.Name, SourcePath: r.SourcePath})
	}
	created, isNew, err := s.repo.Create(ctx, job, jobRoots)
	if err != nil {
		return nil, false, err
	}
	if isNew {
		s.audit.Record(ctx, audit.Event{ActorUserID: &actorID, Action: "download_job.created",
			TargetType: "download_job", TargetID: created.ID.String(),
			Metadata: map[string]any{"owner_user_id": ownerID, "scope_type": in.ScopeType,
				"roots": len(jobRoots), "idempotency_key": job.IdempotencyKey}, IPHash: ipHash})
		s.repo.AddEvent(ctx, created.ID, "job.queued", s.Payload(created))
	}
	return created, isNew, nil
}

func (s *Service) Get(ctx context.Context, actorID uuid.UUID, admin bool, jobID uuid.UUID) (*Job, error) {
	job, err := s.repo.Get(ctx, jobID)
	if err != nil {
		return nil, err
	}
	if !admin && job.RequestedByUserID != actorID && job.DriveOwnerUserID != actorID {
		return nil, apperr.Forbidden("No tiene acceso a este trabajo.")
	}
	return job, nil
}

func (s *Service) List(ctx context.Context, f ListFilter) ([]Job, int, error) {
	jobs, total, err := s.repo.List(ctx, f)
	if jobs == nil {
		jobs = []Job{}
	}
	return jobs, total, err
}

func (s *Service) Cancel(ctx context.Context, actorID uuid.UUID, admin bool, jobID uuid.UUID, ipHash string) (*Job, error) {
	job, err := s.Get(ctx, actorID, admin, jobID)
	if err != nil {
		return nil, err
	}
	updated, err := s.repo.RequestCancel(ctx, job.ID)
	if err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actorID, Action: "download_job.cancel_requested",
		TargetType: "download_job", TargetID: jobID.String(), IPHash: ipHash})
	s.repo.AddEvent(ctx, job.ID, "job.cancel_requested", s.Payload(updated))
	return updated, nil
}

func (s *Service) RetryFailed(ctx context.Context, actorID uuid.UUID, jobID uuid.UUID, ipHash string) (*Job, error) {
	job, err := s.repo.RetryFailed(ctx, jobID)
	if err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actorID, Action: "download_job.retried",
		TargetType: "download_job", TargetID: jobID.String(), IPHash: ipHash})
	s.repo.AddEvent(ctx, job.ID, "job.queued", s.Payload(job))
	return job, nil
}

func (s *Service) Items(ctx context.Context, actorID uuid.UUID, admin bool, jobID uuid.UUID, f ItemFilter) ([]Item, int, error) {
	if _, err := s.Get(ctx, actorID, admin, jobID); err != nil {
		return nil, 0, err
	}
	items, total, err := s.repo.ListItems(ctx, jobID, f)
	if items == nil {
		items = []Item{}
	}
	return items, total, err
}

func (s *Service) StoredFiles(ctx context.Context, actorID uuid.UUID, admin bool, page, size int) ([]StoredFile, int, error) {
	var owner *uuid.UUID
	if !admin {
		owner = &actorID
	}
	files, total, err := s.repo.ListStoredFiles(ctx, owner, page, size)
	if files == nil {
		files = []StoredFile{}
	}
	return files, total, err
}

// OpenFile returns a stored document only after checking job ownership or admin rights.
func (s *Service) OpenFile(ctx context.Context, actorID uuid.UUID, admin bool, fileID uuid.UUID, ipHash string) (*os.File, os.FileInfo, *StoredFile, error) {
	file, err := s.repo.GetStoredFile(ctx, fileID)
	if err != nil {
		return nil, nil, nil, err
	}
	job, err := s.repo.Get(ctx, file.JobID)
	if err != nil {
		return nil, nil, nil, err
	}
	if !admin && job.DriveOwnerUserID != actorID && job.RequestedByUserID != actorID {
		return nil, nil, nil, apperr.Forbidden("No tiene acceso a este documento.")
	}
	f, info, err := s.store.OpenRead(file.RelativePath)
	if err != nil {
		return nil, nil, nil, apperr.NotFound("El documento no está disponible en el almacenamiento.")
	}
	if admin {
		s.audit.Record(ctx, audit.Event{ActorUserID: &actorID, Action: "file.accessed", TargetType: "stored_file",
			TargetID: file.ID.String(), Metadata: map[string]any{"owner_user_id": file.OwnerUserID, "job_id": file.JobID}, IPHash: ipHash})
	}
	return f, info, file, nil
}

func (s *Service) Payload(job *Job) map[string]any {
	if job == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id": job.ID, "status": job.Status, "scope_type": job.ScopeType,
		"total_items": job.TotalItems, "completed_items": job.CompletedItems,
		"skipped_items": job.SkippedItems, "failed_items": job.FailedItems,
		"total_bytes": job.TotalBytes, "downloaded_bytes": job.DownloadedBytes,
		"error_code": job.ErrorCode, "error_message": job.ErrorMessage,
		"finished_at": job.FinishedAt, "updated_at": time.Now().UTC(),
		"drive_owner_name": job.DriveOwnerName, "area_name": job.AreaName, "position_name": job.PositionName,
	}
}
