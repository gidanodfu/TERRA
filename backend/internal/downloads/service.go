package downloads

import (
	"context"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/drive"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/platform/validate"
	"terra/internal/storage"
	"terra/internal/users"
)

const (
	maxRootSelection = 100
	maxDriveIDLength = 256
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
	RootFileIDs   []string `json:"root_file_ids"`
}

// Create valida autorización, alcance, capacidad, conexión y política, y luego
// encola el trabajo. Nunca descarga nada dentro de la petición HTTP.
func (s *Service) Create(ctx context.Context, actorID, ownerID uuid.UUID, in CreateInput,
	idempotencyKey, ipHash string) (*Job, bool, error) {
	fields := map[string]string{}
	validate.MaxItems(fields, "root_folder_ids", in.RootFolderIDs, maxRootSelection,
		"Seleccione como máximo 100 carpetas.")
	validate.MaxItems(fields, "root_file_ids", in.RootFileIDs, maxRootSelection,
		"Seleccione como máximo 100 archivos.")
	validateSelectionIDs(fields, "root_folder_ids", in.RootFolderIDs)
	validateSelectionIDs(fields, "root_file_ids", in.RootFileIDs)
	if len(fields) > 0 {
		return nil, false, apperr.Invalid("Revise la selección de archivos y carpetas.", fields)
	}
	switch in.ScopeType {
	case ScopeMyDriveFull:
		if len(in.RootFolderIDs) > 0 || len(in.RootFileIDs) > 0 {
			return nil, false, apperr.Invalid("Mi unidad completa no acepta selecciones individuales.", nil)
		}
	case ScopeSelectedFolders:
		if len(in.RootFolderIDs) == 0 {
			return nil, false, apperr.Invalid("Seleccione al menos una carpeta.",
				map[string]string{"root_folder_ids": "Seleccione al menos una carpeta."})
		}
		if len(in.RootFileIDs) > 0 {
			return nil, false, apperr.Invalid("La modalidad de carpetas no acepta archivos individuales.",
				map[string]string{"root_file_ids": "Use selected_items para combinar archivos y carpetas."})
		}
	case ScopeSelectedItems:
		if len(in.RootFolderIDs) == 0 && len(in.RootFileIDs) == 0 {
			return nil, false, apperr.Invalid("Seleccione al menos una carpeta o archivo.",
				map[string]string{"root_file_ids": "Seleccione al menos una carpeta o archivo."})
		}
	default:
		return nil, false, apperr.Invalid("Modalidad de descarga inválida.",
			map[string]string{"scope_type": "Use my_drive_full, selected_folders o selected_items."})
	}
	// Una petición repetida devuelve el trabajo original aunque la conexión haya cambiado
	// desde el primer intento.
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

	var selection *drive.Selection
	if in.ScopeType != ScopeMyDriveFull {
		selection, err = s.drive.NormalizeSelections(ctx, ownerID, in.RootFolderIDs, in.RootFileIDs)
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
	var jobFileRoots []FileRoot
	if selection != nil {
		for _, r := range selection.Folders {
			jobRoots = append(jobRoots, Root{GoogleFolderID: r.GoogleID, FolderName: r.Name, SourcePath: r.SourcePath})
		}
		for _, f := range selection.Files {
			jobFileRoots = append(jobFileRoots, FileRoot{
				GoogleFileID: f.GoogleID, FileName: f.Name, SourcePath: f.SourcePath,
			})
		}
	}
	created, isNew, err := s.repo.Create(ctx, job, jobRoots, jobFileRoots)
	if err != nil {
		return nil, false, err
	}
	if isNew {
		s.audit.Record(ctx, audit.Event{ActorUserID: &actorID, Action: "download_job.created",
			TargetType: "download_job", TargetID: created.ID.String(),
			Metadata: map[string]any{"owner_user_id": ownerID, "scope_type": in.ScopeType,
				"roots": len(jobRoots), "file_roots": len(jobFileRoots),
				"selected_total":  len(jobRoots) + len(jobFileRoots),
				"idempotency_key": job.IdempotencyKey}, IPHash: ipHash})
		s.repo.AddEvent(ctx, created.ID, "job.queued", s.Payload(created))
	}
	return created, isNew, nil
}

func validateSelectionIDs(fields map[string]string, key string, values []string) {
	for _, raw := range values {
		id := strings.TrimSpace(raw)
		if id == "" {
			fields[key] = "Los identificadores de Drive no pueden estar vacíos."
			return
		}
		if utf8.RuneCountInString(id) > maxDriveIDLength {
			fields[key] = "Uno de los identificadores de Drive es demasiado largo."
			return
		}
	}
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

func (s *Service) Progress(ctx context.Context, job *Job) (*ProgressSnapshot, int64) {
	progress, revision, err := s.repo.GetProgress(ctx, job.ID)
	if err == nil {
		return progress, revision
	}
	progress, err = s.repo.BuildProgress(ctx, job, nil)
	if err != nil {
		return nil, 0
	}
	return progress, 0
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

// OpenFile devuelve un documento almacenado solo después de comprobar la propiedad del trabajo o los derechos de administrador.
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
		s.audit.Record(ctx, audit.Event{ActorUserID: &actorID, Action: "file.access_failed", TargetType: "stored_file",
			TargetID: file.ID.String(), Metadata: map[string]any{
				"owner_user_id": file.OwnerUserID, "job_id": file.JobID, "reason": "not_available",
			}, IPHash: ipHash})
		return nil, nil, nil, apperr.NotFound("El documento no está disponible en el almacenamiento.")
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actorID, Action: "file.accessed", TargetType: "stored_file",
		TargetID: file.ID.String(), Metadata: map[string]any{"owner_user_id": file.OwnerUserID, "job_id": file.JobID}, IPHash: ipHash})
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
