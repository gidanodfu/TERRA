package downloads

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"

	"terra/internal/drive"
	"terra/internal/platform/config"
	"terra/internal/storage"
)

const maxItemAttempts = 5

var errWaiting = errors.New("job waiting for authorization")

type Worker struct {
	cfg       config.Config
	repo      *Repository
	driveRepo *drive.Repository
	provider  *drive.Provider
	store     *storage.Store
	log       *slog.Logger
	limiter   *AccountLimiter
	id        string
}

func NewWorker(cfg config.Config, repo *Repository, driveRepo *drive.Repository, provider *drive.Provider,
	store *storage.Store, log *slog.Logger) *Worker {
	host, _ := os.Hostname()
	return &Worker{
		cfg: cfg, repo: repo, driveRepo: driveRepo, provider: provider, store: store, log: log,
		limiter: NewAccountLimiter(),
		id:      fmt.Sprintf("%s-%d-%s", host, os.Getpid(), uuid.NewString()[:8]),
	}
}

// Run reclama trabajos en cola o abandonados hasta que se detiene el proceso.
func (w *Worker) Run(ctx context.Context) error {
	w.log.Info("worker_started", "worker_id", w.id, "concurrency", w.cfg.Worker.Concurrency,
		"per_account", w.cfg.Worker.PerAccountConcurrency)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		job, err := w.repo.ClaimNext(ctx, w.id, w.cfg.Worker.Lease)
		if err != nil {
			w.log.Error("claim_failed", "error", err)
			if !sleepCtx(ctx, 5*time.Second) {
				return ctx.Err()
			}
			continue
		}
		if job == nil {
			if !sleepCtx(ctx, 2*time.Second) {
				return ctx.Err()
			}
			continue
		}
		w.process(ctx, job)
	}
}

func (w *Worker) process(parent context.Context, job *Job) {
	jobCtx, cancel := context.WithCancel(parent)
	defer cancel()
	tracker := NewJobProgressTracker(time.Now())
	progressDone := make(chan struct{})
	var progressWG sync.WaitGroup
	progressWG.Add(1)
	go func() {
		defer progressWG.Done()
		w.publishProgress(jobCtx, job.ID, tracker, progressDone)
	}()
	defer func() {
		close(progressDone)
		progressWG.Wait()
		w.persistProgress(context.Background(), job.ID, tracker)
	}()

	var cancelRequested atomic.Bool
	var leaseLost atomic.Bool
	stopHeartbeat := make(chan struct{})
	go w.heartbeat(jobCtx, cancel, stopHeartbeat, job.ID, &cancelRequested, &leaseLost)

	err := w.runJob(jobCtx, parent, job, &cancelRequested, tracker)
	close(stopHeartbeat)

	if leaseLost.Load() {
		w.log.Warn("job_lease_lost", "job_id", job.ID)
		return
	}
	if errors.Is(err, errWaiting) {
		return
	}
	if err != nil {
		var apiErr *drive.APIError
		if errors.As(err, &apiErr) && apiErr.Reauth {
			_ = w.driveRepo.SetStatus(parent, job.DriveConnectionID, drive.StatusReauthorizationNeeded,
				"refresh_token_invalid")
			_ = w.repo.ReleaseWaiting(parent, job.ID, w.id, "drive_reauthorization_required",
				"El trabajador debe reconectar Google Drive para continuar.")
			w.repo.AddEvent(parent, job.ID, "job.waiting_authorization", w.jobPayload(parent, job.ID))
			w.log.Warn("job_waiting_authorization", "job_id", job.ID)
			return
		}
		if errors.Is(err, context.Canceled) || cancelRequested.Load() {
			_ = w.repo.CancelPending(parent, job.ID)
			_, _ = w.repo.RecomputeCounters(parent, job.ID)
			_ = w.repo.Finish(parent, job.ID, w.id, JobCancelled, "cancelled", "Trabajo cancelado por el administrador.")
			w.repo.AddEvent(parent, job.ID, "job.done", w.jobPayload(parent, job.ID))
			return
		}
		code, message := classifyJobError(err)
		_ = w.repo.FailRemaining(parent, job.ID, code, message)
		_, _ = w.repo.RecomputeCounters(parent, job.ID)
		_ = w.repo.Finish(parent, job.ID, w.id, JobFailed, code, message)
		w.repo.AddEvent(parent, job.ID, "job.done", w.jobPayload(parent, job.ID))
		w.log.Error("job_failed", "job_id", job.ID, "error", err, "code", code)
		return
	}

	if cancelRequested.Load() {
		_ = w.repo.CancelPending(parent, job.ID)
	}
	pending, completed, skipped, failed, countsErr := w.repo.RemainingCounts(parent, job.ID)
	if countsErr != nil {
		w.log.Error("counts_failed", "job_id", job.ID, "error", countsErr)
	}
	if pending > 0 && !cancelRequested.Load() {
		_ = w.repo.FailRemaining(parent, job.ID, "incomplete_items", "Quedaron elementos incompletos al finalizar el trabajo.")
		_, completed, skipped, failed, _ = w.repo.RemainingCounts(parent, job.ID)
	}
	final, code, message := JobCompleted, "", ""
	switch {
	case cancelRequested.Load():
		final = JobCancelled
		code = "cancelled"
		message = "Trabajo cancelado por el administrador."
	case failed > 0 && completed > 0:
		final = JobPartiallyCompleted
		code = "partial_failure"
		message = fmt.Sprintf("%d elementos no se pudieron descargar.", failed)
	case failed > 0:
		final = JobFailed
		code = "all_failed"
		message = "No se pudo descargar ningún elemento."
	}
	if _, err := w.repo.RecomputeCounters(parent, job.ID); err != nil {
		w.log.Error("recompute_failed", "job_id", job.ID, "error", err)
	}
	if err := w.repo.Finish(parent, job.ID, w.id, final, code, message); err != nil {
		w.log.Error("finish_failed", "job_id", job.ID, "error", err)
		return
	}
	w.repo.AddEvent(parent, job.ID, "job.done", w.jobPayload(parent, job.ID))
	w.log.Info("job_finished", "job_id", job.ID, "status", final,
		"completed", completed, "skipped", skipped, "failed", failed)
}

func (w *Worker) heartbeat(ctx context.Context, cancel context.CancelFunc, stop <-chan struct{},
	jobID uuid.UUID, cancelRequested, leaseLost *atomic.Bool) {
	ticker := time.NewTicker(w.cfg.Worker.Heartbeat)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			_, requested, err := w.repo.Heartbeat(context.Background(), jobID, w.id, w.cfg.Worker.Lease)
			if err != nil {
				w.log.Warn("heartbeat_lost", "job_id", jobID, "error", err)
				leaseLost.Store(true)
				cancel()
				return
			}
			if requested {
				cancelRequested.Store(true)
				cancel()
				return
			}
		}
	}
}

func (w *Worker) runJob(ctx context.Context, parent context.Context, job *Job, cancelRequested *atomic.Bool, tracker *JobProgressTracker) error {
	conn, err := w.driveRepo.GetByID(ctx, job.DriveConnectionID)
	if err != nil {
		return fmt.Errorf("drive connection unavailable: %w", err)
	}
	policy, err := w.driveRepo.LatestPolicy(ctx)
	if err != nil {
		return fmt.Errorf("policy unavailable: %w", err)
	}
	if conn.Status != drive.StatusConnected || !conn.HasRefreshToken || conn.PolicyVersion != policy.Version {
		_ = w.repo.ReleaseWaiting(parent, job.ID, w.id, "drive_reauthorization_required",
			"El trabajador debe reconectar Google Drive y aceptar la política vigente.")
		return errWaiting
	}
	api, err := w.provider.NewAPI(ctx, conn)
	if err != nil {
		return &drive.APIError{Code: "drive_reauthorization_required", Reauth: true, Err: err}
	}

	jobRoot, err := w.store.JobRoot(job.AreaID, job.AreaSlug, job.PositionID, job.PositionSlug,
		job.DriveOwnerUserID, job.ID)
	if err != nil {
		return err
	}
	if _, err := w.store.EnsureDir(jobRoot); err != nil {
		return err
	}

	if job.Status == JobCancelRequested {
		cancelRequested.Store(true)
		return context.Canceled
	}

	if job.ScanCompletedAt == nil {
		if err := w.scan(ctx, job, api, jobRoot, tracker); err != nil {
			return err
		}
		w.driveRepo.MarkRefreshed(parent, conn.ID)
		if err := w.repo.MarkScanCompleted(parent, job.ID); err != nil {
			return err
		}
		w.repo.AddEvent(parent, job.ID, "job.scanned", w.jobPayload(parent, job.ID))
	} else {
		_ = w.repo.SetStatus(parent, job.ID, JobDownloading)
	}

	if err := w.downloadAll(ctx, parent, job, api, jobRoot, cancelRequested, tracker); err != nil {
		return err
	}
	return nil
}

// --- escaneo ---

type folderTask struct {
	id       string
	segments []string
}

func (w *Worker) scan(ctx context.Context, job *Job, api *drive.API, jobRoot string, tracker *JobProgressTracker) error {
	rootID, err := api.RootID(ctx)
	if err != nil {
		return err
	}
	var queue []folderTask
	if job.ScopeType == ScopeMyDriveFull {
		queue = append(queue, folderTask{id: rootID})
		tracker.FolderDiscovered()
	} else {
		for _, root := range job.Roots {
			chain, err := api.PathToRoot(ctx, root.GoogleFolderID)
			if err != nil {
				return err
			}
			if len(chain) == 0 {
				continue
			}
			segments := make([]string, 0, len(chain))
			for _, f := range chain {
				segments = append(segments, storage.Sanitize(f.Name))
			}
			queue = append(queue, folderTask{id: root.GoogleFolderID, segments: segments})
			tracker.FolderDiscovered()
		}
	}

	visited := map[string]bool{}
	used := map[string]map[string]string{}
	inserted := 0

	for len(queue) > 0 {
		if err := ctx.Err(); err != nil {
			return err
		}
		task := queue[0]
		queue = queue[1:]
		if visited[task.id] {
			continue
		}
		visited[task.id] = true
		tracker.FolderScanned()

		dirRel := storage.Child(jobRoot, task.segments...)
		if _, err := w.store.EnsureDir(dirRel); err != nil {
			return err
		}
		children, err := api.ListChildren(ctx, task.id)
		if err != nil {
			return err
		}
		sort.Slice(children, func(i, j int) bool {
			if children[i].Name == children[j].Name {
				return children[i].ID < children[j].ID
			}
			return children[i].Name < children[j].Name
		})
		dirKey := strings.Join(task.segments, "/")
		if used[dirKey] == nil {
			used[dirKey] = map[string]string{}
		}

		for _, child := range children {
			if child.Trashed {
				continue
			}
			tracker.ItemFound()
			if child.MimeType == drive.MimeFolder {
				name := storage.UniqueName(used[dirKey], child.Name, child.ID)
				nodeID, err := w.driveRepo.UpsertNode(ctx, job.DriveConnectionID, child)
				if err != nil {
					return err
				}
				parents := child.Parents
				if len(parents) == 0 {
					parents = []string{task.id}
				}
				_ = w.driveRepo.SyncNodeParents(ctx, nodeID, parents)
				if _, err := w.store.EnsureDir(storage.Child(jobRoot, append(append([]string{}, task.segments...), name)...)); err != nil {
					return err
				}
				queue = append(queue, folderTask{id: child.ID, segments: append(append([]string{}, task.segments...), name)})
				tracker.FolderDiscovered()
				continue
			}

			nodeID, err := w.driveRepo.UpsertNode(ctx, job.DriveConnectionID, child)
			if err != nil {
				return err
			}
			parents := child.Parents
			if len(parents) == 0 {
				parents = []string{task.id}
			}
			_ = w.driveRepo.SyncNodeParents(ctx, nodeID, parents)

			if child.MimeType == drive.MimeShortcut {
				name := storage.UniqueName(used[dirKey], child.Name, child.ID)
				created, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemSkipped,
					nil, "shortcut_reference", "Atajo de Google Drive registrado como referencia; no se duplica su contenido.")
				if err != nil {
					return err
				}
				if created {
					inserted++
				}
				tracker.SkippedItem()
				continue
			}
			if drive.IsNative(child.MimeType) {
				exportMime, ok := drive.ExportMime(child.MimeType)
				if !ok {
					name := storage.UniqueName(used[dirKey], child.Name, child.ID)
					code := "unsupported_google_type"
					if child.MimeType == drive.MimeVids {
						code = "google_vids_out_of_scope"
					}
					if _, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemSkipped,
						nil, code, "Formato nativo no soportado en el alcance del MVP."); err != nil {
						return err
					}
					inserted++
					tracker.SkippedItem()
					continue
				}
				if !child.CanDownload {
					name := storage.UniqueName(used[dirKey], withExtension(child.Name, exportMime), child.ID)
					if _, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemSkipped,
						nil, "not_downloadable", "Google Drive no permite exportar este documento."); err != nil {
						return err
					}
					inserted++
					tracker.SkippedItem()
					continue
				}
				display := withExtension(child.Name, exportMime)
				name := storage.UniqueName(used[dirKey], display, child.ID)
				created, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemPending,
					nil, "", "")
				if err != nil {
					return err
				}
				if created {
					inserted++
					tracker.DownloadableItem()
				}
				continue
			}
			if !child.CanDownload {
				name := storage.UniqueName(used[dirKey], child.Name, child.ID)
				if _, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemSkipped,
					nil, "not_downloadable", "Google Drive no permite descargar este archivo."); err != nil {
					return err
				}
				inserted++
				tracker.SkippedItem()
				continue
			}
			name := storage.UniqueName(used[dirKey], child.Name, child.ID)
			size := child.Size
			created, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemPending,
				&size, "", "")
			if err != nil {
				return err
			}
			if created {
				inserted++
				tracker.DownloadableItem()
			}
		}
	}
	rootFolders := map[string]bool{}
	for _, root := range job.Roots {
		rootFolders[root.GoogleFolderID] = true
	}
	for _, root := range job.FileRoots {
		created, err := w.scanFileRoot(ctx, job, api, jobRoot, root, used, rootFolders, tracker)
		if err != nil {
			return err
		}
		inserted += created
	}

	if _, err := w.repo.RecomputeCounters(ctx, job.ID); err != nil {
		return err
	}
	w.log.Info("scan_completed", "job_id", job.ID, "items", inserted, "folders", len(visited),
		"file_roots", len(job.FileRoots))
	return nil
}

// scanFileRoot registra un archivo seleccionado individualmente conservando su
// ruta original y sin recorrer su carpeta contenedora.
func (w *Worker) scanFileRoot(ctx context.Context, job *Job, api *drive.API, jobRoot string,
	root FileRoot, used map[string]map[string]string, rootFolders map[string]bool, tracker *JobProgressTracker) (int, error) {
	tracker.ItemFound()
	file, err := api.GetFile(ctx, root.GoogleFileID)
	if err != nil {
		return w.skipFileRoot(ctx, job, root, "source_missing", "El archivo ya no existe en Google Drive.")
	}
	if file.Trashed {
		return w.skipFileRoot(ctx, job, root, "source_missing", "El archivo está en la papelera de Google Drive.")
	}
	if file.MimeType == drive.MimeFolder || file.IsShortcut {
		return w.skipFileRoot(ctx, job, root, "invalid_root", "La raíz seleccionada ya no es un archivo descargable.")
	}

	chain, err := api.PathToRoot(ctx, root.GoogleFileID)
	if err != nil {
		return w.skipFileRoot(ctx, job, root, "source_missing", "No se pudo resolver la ruta del archivo.")
	}
	if len(chain) == 0 || chain[len(chain)-1].ID != root.GoogleFileID {
		return w.skipFileRoot(ctx, job, root, "source_missing", "Google Drive no devolvió el archivo esperado.")
	}
	for i := 0; i < len(chain)-1; i++ {
		if rootFolders[chain[i].ID] {
			// Cubierto por una carpeta seleccionada; la carpeta ya lo procesará.
			return 0, nil
		}
	}

	segments := make([]string, 0, len(chain)-1)
	for i := 0; i < len(chain)-1; i++ {
		segments = append(segments, storage.Sanitize(chain[i].Name))
	}
	parents := file.Parents
	if len(parents) == 0 && len(chain) > 1 {
		parents = []string{chain[len(chain)-2].ID}
	}
	dirRel := storage.Child(jobRoot, segments...)
	if _, err := w.store.EnsureDir(dirRel); err != nil {
		return 0, err
	}
	dirKey := strings.Join(segments, "/")
	if used[dirKey] == nil {
		used[dirKey] = map[string]string{}
	}

	if drive.IsNative(file.MimeType) {
		exportMime, ok := drive.ExportMime(file.MimeType)
		if !ok {
			code := "unsupported_google_type"
			message := "Formato nativo de Google no soportado en esta versión."
			if file.MimeType == drive.MimeVids {
				code = "google_vids_out_of_scope"
				message = "Google Vids requiere un flujo asíncrono no incluido en esta versión."
			}
			return w.skipFileRoot(ctx, job, root, code, message)
		}
		if file.MimeType != drive.MimeForm && !file.CanDownload {
			return w.skipFileRoot(ctx, job, root, "not_downloadable", "Google Drive no permite exportar este archivo.")
		}
		display := withExtension(file.Name, exportMime)
		nodeID, err := w.driveRepo.UpsertNode(ctx, job.DriveConnectionID, *file)
		if err != nil {
			return 0, err
		}
		if err := w.driveRepo.SyncNodeParents(ctx, nodeID, parents); err != nil {
			return 0, err
		}
		name := storage.UniqueName(used[dirKey], display, file.ID)
		created, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemPending, nil, "", "")
		if err != nil {
			return 0, err
		}
		if created {
			return 1, nil
		}
		return 0, nil
	}

	if !file.CanDownload {
		return w.skipFileRoot(ctx, job, root, "not_downloadable", "Google Drive no permite descargar este archivo.")
	}
	nodeID, err := w.driveRepo.UpsertNode(ctx, job.DriveConnectionID, *file)
	if err != nil {
		return 0, err
	}
	if err := w.driveRepo.SyncNodeParents(ctx, nodeID, parents); err != nil {
		return 0, err
	}
	name := storage.UniqueName(used[dirKey], file.Name, file.ID)
	size := file.Size
	created, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel, name), ItemPending, &size, "", "")
	if err != nil {
		return 0, err
	}
	if created {
		return 1, nil
	}
	return 0, nil
}

func (w *Worker) skipFileRoot(ctx context.Context, job *Job, root FileRoot, code, message string) (int, error) {
	nodeID := uuid.Nil
	if existing, err := w.driveRepo.GetNode(ctx, job.DriveConnectionID, root.GoogleFileID); err == nil {
		nodeID = existing.ID
	} else {
		var err error
		nodeID, err = w.driveRepo.UpsertNode(ctx, job.DriveConnectionID, drive.RemoteFile{
			ID: root.GoogleFileID, Name: root.FileName, MimeType: "application/octet-stream",
		})
		if err != nil {
			return 0, err
		}
	}
	segments := strings.Split(root.SourcePath, "/")
	if len(segments) > 0 {
		segments = segments[:len(segments)-1]
	}
	jobRoot, err := w.store.JobRoot(job.AreaID, job.AreaSlug, job.PositionID, job.PositionSlug,
		job.DriveOwnerUserID, job.ID)
	if err != nil {
		return 0, err
	}
	dirRel := storage.Child(jobRoot, sanitizeSegments(segments)...)
	if _, err := w.store.EnsureDir(dirRel); err != nil {
		return 0, err
	}
	created, err := w.repo.CreateItem(ctx, job.ID, nodeID, storage.Child(dirRel,
		storage.Sanitize(root.FileName)), ItemSkipped, nil, code, message)
	if err != nil {
		return 0, err
	}
	if created {
		return 1, nil
	}
	return 0, nil
}

func sanitizeSegments(segments []string) []string {
	out := make([]string, 0, len(segments))
	for _, segment := range segments {
		if segment != "" {
			out = append(out, storage.Sanitize(segment))
		}
	}
	return out
}

func withExtension(name, exportMime string) string {
	ext := drive.ExportExtension(exportMime)
	if ext == "" {
		ext = ".bin"
	}
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, strings.ToLower(ext)) {
		return name
	}
	return name + ext
}

// --- descarga ---

func (w *Worker) downloadAll(ctx context.Context, parent context.Context, job *Job, api *drive.API,
	jobRoot string, cancelRequested *atomic.Bool, tracker *JobProgressTracker) error {
	concurrency := w.cfg.Worker.Concurrency
	if w.cfg.Worker.PerAccountConcurrency < concurrency {
		concurrency = w.cfg.Worker.PerAccountConcurrency
	}
	if concurrency < 1 {
		concurrency = 1
	}
	var reauth atomic.Bool
	var capacity atomic.Bool
	var capacityCode atomic.Value
	capacityCode.Store("")

	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if reauth.Load() {
			return &drive.APIError{Code: "drive_reauthorization_required", Reauth: true,
				Err: errors.New("drive authorization lost")}
		}
		if capacity.Load() {
			code, _ := capacityCode.Load().(string)
			if code == "" {
				code = "capacity_exceeded"
			}
			_ = w.repo.FailRemaining(parent, job.ID, code, "Se alcanzó un límite de capacidad configurado.")
			_, _ = w.repo.RecomputeCounters(parent, job.ID)
			return nil
		}
		if err := w.checkCapacity(ctx, job); err != nil {
			capacityCode.Store("capacity_exceeded")
			capacity.Store(true)
			continue
		}

		batch, err := w.repo.PendingItems(ctx, job.ID, 200)
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			retrying, err := w.repo.RetryingCount(ctx, job.ID)
			if err != nil {
				return err
			}
			if retrying > 0 {
				if !sleepCtx(ctx, 2*time.Second) {
					return ctx.Err()
				}
				continue
			}
			return nil
		}

		sem := make(chan struct{}, concurrency)
		var wg sync.WaitGroup
		for i := range batch {
			item := batch[i]
			wg.Add(1)
			sem <- struct{}{}
			go func() {
				defer wg.Done()
				defer func() { <-sem }()
				if ctx.Err() != nil || reauth.Load() || capacity.Load() {
					_ = w.repo.ResetToPending(parent, item.ID)
					return
				}
				w.downloadItem(ctx, parent, job, api, item, &reauth, &capacity, &capacityCode, tracker)
			}()
		}
		wg.Wait()
		if _, err := w.repo.RecomputeCounters(parent, job.ID); err != nil {
			return err
		}
	}
}

func (w *Worker) checkCapacity(ctx context.Context, job *Job) error {
	jobBytes, err := w.repo.JobBytes(ctx, job.ID)
	if err != nil {
		return err
	}
	if jobBytes >= w.cfg.Limits.MaxJobBytes {
		return errors.New("job byte limit")
	}
	userBytes, err := w.repo.UserStorageBytes(ctx, job.DriveOwnerUserID)
	if err != nil {
		return err
	}
	if userBytes >= w.cfg.Limits.MaxUserStorageBytes {
		return errors.New("user storage limit")
	}
	areaBytes, err := w.repo.AreaStorageBytes(ctx, job.AreaID)
	if err != nil {
		return err
	}
	if areaBytes >= w.cfg.Limits.MaxAreaStorageBytes {
		return errors.New("area storage limit")
	}
	return w.store.CheckFreeSpace()
}

func (w *Worker) downloadItem(ctx context.Context, parent context.Context, job *Job, api *drive.API,
	item WorkerItem, reauth, capacity *atomic.Bool, capacityCode *atomic.Value, tracker *JobProgressTracker) {
	ok, err := w.repo.MarkDownloading(parent, item.ID)
	if err != nil || !ok {
		return
	}
	if item.SizeBytes != nil && *item.SizeBytes > w.cfg.Limits.MaxDownloadBytes {
		_ = w.repo.MarkSkipped(parent, item.ID, "size_limit_exceeded", describeError("size_limit_exceeded"))
		w.emitItem(parent, job.ID, item, ItemSkipped, "size_limit_exceeded")
		return
	}
	if err := w.limiter.Wait(ctx, job.DriveConnectionID.String(), w.cfg.DownloadMinGap); err != nil {
		_ = w.repo.ResetToPending(parent, item.ID)
		return
	}

	remote := drive.RemoteFile{
		ID: item.GoogleFileID, Name: item.Name, MimeType: item.MimeType,
		MD5: item.MD5, CanDownload: item.CanDownload, IsShortcut: item.IsShortcut,
	}
	if item.SizeBytes != nil {
		remote.Size = *item.SizeBytes
	}
	body, expectedLen, exportMime, err := api.OpenDownload(ctx, remote)
	if err != nil {
		w.handleItemError(parent, job, item, err, reauth, capacity, capacityCode)
		return
	}
	defer body.Close()

	expected := expectedLen
	if item.SizeBytes != nil && *item.SizeBytes > 0 {
		expected = *item.SizeBytes
	}
	var expectedPtr *int64
	if expected > 0 {
		expectedPtr = &expected
		if item.SizeBytes == nil {
			_ = w.repo.SetItemExpectedSize(parent, item.ID, expected)
		}
	}
	tracker.StartItem(item.ID, item.Name, expectedPtr)
	w.repo.AddEvent(parent, job.ID, "item.started", map[string]any{
		"item_id": item.ID, "name": item.Name, "expected_bytes": expectedPtr,
	})
	defer tracker.FailItem(item.ID)

	tmp, tmpPath, err := w.store.CreateTemp(item.RelativePath, item.ID)
	if err != nil {
		w.handleItemError(parent, job, item, err, reauth, capacity, capacityCode)
		return
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	limit := w.cfg.Limits.MaxDownloadBytes
	jobBytes, _ := w.repo.JobBytes(parent, job.ID)
	if remaining := w.cfg.Limits.MaxJobBytes - jobBytes; remaining < limit {
		limit = remaining
	}
	if limit <= 0 {
		_ = w.repo.MarkSkipped(parent, item.ID, "size_limit_exceeded", "Se alcanzó el tamaño máximo del trabajo.")
		w.emitItem(parent, job.ID, item, ItemSkipped, "size_limit_exceeded")
		return
	}

	sha := sha256.New()
	md5h := md5.New()
	reader := io.LimitReader(body, limit+1)
	buf := make([]byte, 256*1024)
	written, copyErr := io.CopyBuffer(io.MultiWriter(tmp, tracker.Writer(item.ID), sha, md5h), reader, buf)
	if copyErr != nil {
		_ = tmp.Close()
		w.handleItemError(parent, job, item, copyErr, reauth, capacity, capacityCode)
		return
	}
	if written > limit {
		_ = tmp.Close()
		_ = w.repo.MarkSkipped(parent, item.ID, "size_limit_exceeded", describeError("size_limit_exceeded"))
		w.emitItem(parent, job.ID, item, ItemSkipped, "size_limit_exceeded")
		return
	}
	if expectedLen > 0 && written != expectedLen {
		_ = tmp.Close()
		w.handleItemError(parent, job, item, &drive.APIError{Code: "incomplete_transfer",
			Transient: true, Err: fmt.Errorf("expected %d bytes, got %d", expectedLen, written)},
			reauth, capacity, capacityCode)
		return
	}
	if item.MD5 != "" && !strings.EqualFold(hex.EncodeToString(md5h.Sum(nil)), item.MD5) {
		_ = tmp.Close()
		w.handleItemError(parent, job, item, &drive.APIError{Code: "checksum_mismatch",
			Transient: true, Err: errors.New("MD5 mismatch")}, reauth, capacity, capacityCode)
		return
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		w.handleItemError(parent, job, item, err, reauth, capacity, capacityCode)
		return
	}
	if err := tmp.Close(); err != nil {
		w.handleItemError(parent, job, item, err, reauth, capacity, capacityCode)
		return
	}
	abs, err := w.store.Abs(item.RelativePath)
	if err != nil {
		w.handleItemError(parent, job, item, err, reauth, capacity, capacityCode)
		return
	}
	// Un archivo sobrante solo puede pertenecer a este mismo snapshot del trabajo (el UUID del trabajo está en la ruta).
	if _, statErr := os.Lstat(abs); statErr == nil {
		_ = os.Remove(abs)
	}
	if err := storage.RenameAtomic(tmpPath, abs); err != nil {
		w.handleItemError(parent, job, item, err, reauth, capacity, capacityCode)
		return
	}
	cleanup = false

	sum := hex.EncodeToString(sha.Sum(nil))
	if err := w.repo.MarkCompleted(parent, job.ID, job.DriveOwnerUserID, item.ID, item.DriveNodeID,
		item.RelativePath, written, sum, exportMime, item.RevisionID, item.ModifiedTime); err != nil {
		w.log.Error("mark_completed_failed", "job_id", job.ID, "item_id", item.ID, "error", err)
		return
	}
	tracker.CompleteItem(item.ID, written)
	w.repo.AddEvent(parent, job.ID, "item.completed", map[string]any{
		"item_id": item.ID, "name": item.Name, "size_bytes": written, "sha256": sum,
	})
}

func (w *Worker) handleItemError(ctx context.Context, job *Job, item WorkerItem, err error,
	reauth, capacity *atomic.Bool, capacityCode *atomic.Value) {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		_ = w.repo.ResetToPending(ctx, item.ID)
		return
	}
	apiErr := drive.Translate(err)
	switch {
	case apiErr.Reauth:
		_ = w.repo.ResetToPending(ctx, item.ID)
		reauth.Store(true)
		return
	case apiErr.Code == "not_downloadable" || apiErr.Code == "unsupported_google_type":
		_ = w.repo.MarkSkipped(ctx, item.ID, apiErr.Code, describeError(apiErr.Code))
		w.emitItem(ctx, job.ID, item, ItemSkipped, apiErr.Code)
		return
	case apiErr.Code == "drive_not_found":
		_ = w.repo.MarkSkipped(ctx, item.ID, "source_missing", "El archivo ya no existe en Google Drive.")
		w.emitItem(ctx, job.ID, item, ItemSkipped, "source_missing")
		return
	}
	if apiErr.Transient {
		if item.AttemptCount+1 >= maxItemAttempts {
			_ = w.repo.MarkFailed(ctx, item.ID, apiErr.Code, describeError(apiErr.Code))
			w.emitItem(ctx, job.ID, item, ItemFailed, apiErr.Code)
			return
		}
		next := time.Now().Add(backoff(item.AttemptCount+1, apiErr.RetryAfter))
		_ = w.repo.MarkRetry(ctx, item.ID, apiErr.Code, describeError(apiErr.Code), next)
		w.emitItem(ctx, job.ID, item, ItemRetrying, apiErr.Code)
		return
	}
	if strings.Contains(strings.ToLower(err.Error()), "no space") ||
		strings.Contains(strings.ToLower(err.Error()), "disk") {
		capacityCode.Store("capacity_disk")
		capacity.Store(true)
		_ = w.repo.ResetToPending(ctx, item.ID)
		return
	}
	_ = w.repo.MarkFailed(ctx, item.ID, apiErr.Code, describeError(apiErr.Code))
	w.emitItem(ctx, job.ID, item, ItemFailed, apiErr.Code)
}

func (w *Worker) emitItem(ctx context.Context, jobID uuid.UUID, item WorkerItem, status, code string) {
	w.repo.AddEvent(ctx, jobID, "item."+status, map[string]any{
		"item_id": item.ID, "name": item.Name, "status": status, "error_code": code,
	})
}

func (w *Worker) jobPayload(ctx context.Context, jobID uuid.UUID) map[string]any {
	job, err := w.repo.Get(ctx, jobID)
	if err != nil {
		return map[string]any{"id": jobID}
	}
	return map[string]any{
		"id": job.ID, "status": job.Status, "total_items": job.TotalItems,
		"completed_items": job.CompletedItems, "skipped_items": job.SkippedItems,
		"failed_items": job.FailedItems, "total_bytes": job.TotalBytes,
		"downloaded_bytes": job.DownloadedBytes, "error_code": job.ErrorCode,
	}
}

func classifyJobError(err error) (string, string) {
	apiErr := drive.Translate(err)
	if apiErr.Code != "" && apiErr.Code != "drive_transient" {
		return apiErr.Code, describeError(apiErr.Code)
	}
	return "job_failed", "El trabajo no pudo completarse. Revise los detalles."
}

func sleepCtx(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return true
	case <-ctx.Done():
		return false
	}
}

func (w *Worker) publishProgress(ctx context.Context, jobID uuid.UUID, tracker *JobProgressTracker, stop <-chan struct{}) {
	w.persistProgress(ctx, jobID, tracker)
	interval := w.cfg.Worker.ProgressInterval
	if interval < 100*time.Millisecond {
		interval = 100 * time.Millisecond
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.persistProgress(ctx, jobID, tracker)
		}
	}
}

func (w *Worker) persistProgress(ctx context.Context, jobID uuid.UUID, tracker *JobProgressTracker) {
	job, err := w.repo.Get(ctx, jobID)
	if err != nil {
		w.log.Debug("progress_job_unavailable", "job_id", jobID, "error", err)
		return
	}
	snapshot, err := w.repo.BuildProgress(ctx, job, tracker)
	if err != nil {
		w.log.Warn("progress_build_failed", "job_id", jobID, "error", err)
		return
	}
	if _, err := w.repo.SaveProgress(ctx, snapshot); err != nil {
		w.log.Warn("progress_save_failed", "job_id", jobID, "error", err)
	}
}
