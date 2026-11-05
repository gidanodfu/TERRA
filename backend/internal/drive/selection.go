package drive

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"terra/internal/platform/apperr"
)

// NormalizeRoots conserva el contrato histórico de selección de carpetas.
func (s *Service) NormalizeRoots(ctx context.Context, ownerID uuid.UUID, ids []string) ([]Root, error) {
	selection, err := s.NormalizeSelections(ctx, ownerID, ids, nil)
	if err != nil {
		return nil, err
	}
	return selection.Folders, nil
}

// NormalizeSelections valida carpetas y archivos contra Google Drive, elimina
// duplicados y descarta archivos cubiertos por una carpeta seleccionada.
func (s *Service) NormalizeSelections(ctx context.Context, ownerID uuid.UUID,
	folderIDs, fileIDs []string) (*Selection, error) {
	conn, err := s.EnsureReadyForUser(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	folderIDs = dedupe(folderIDs)
	fileIDs = dedupe(fileIDs)
	if len(folderIDs) == 0 && len(fileIDs) == 0 {
		field := "Seleccione al menos una carpeta o archivo."
		return nil, apperr.Invalid(field, map[string]string{
			"root_folder_ids": field, "root_file_ids": field,
		})
	}
	if len(folderIDs) > 100 {
		return nil, apperr.Invalid("Seleccione como máximo 100 carpetas.", nil)
	}
	if len(fileIDs) > 100 {
		return nil, apperr.Invalid("Seleccione como máximo 100 archivos.", nil)
	}
	for _, id := range fileIDs {
		if contains(folderIDs, id) {
			return nil, apperr.BadRequest("Un mismo elemento no puede enviarse como carpeta y archivo.")
		}
	}

	api, err := s.newAPI(ctx, conn)
	if err != nil {
		return nil, apperr.Conflict("drive_reauthorization_required", "El trabajador debe reconectar su cuenta de Google Drive.")
	}
	rootID, err := api.RootID(ctx)
	if err != nil {
		return nil, translateAPI(err)
	}

	type folderCandidate struct {
		Root
		ancestors map[string]bool
	}
	type fileCandidate struct {
		FileRoot
		ancestors map[string]bool
	}

	folders := make([]folderCandidate, 0, len(folderIDs))
	for _, id := range folderIDs {
		if id == "root" || id == rootID {
			return nil, apperr.BadRequest("Para respaldar Mi unidad completa use scope_type=my_drive_full.")
		}
		chain, err := api.PathToRoot(ctx, id)
		if err != nil {
			return nil, translateAPI(err)
		}
		if len(chain) == 0 {
			return nil, apperr.BadRequest("Carpeta inválida.")
		}
		leaf := chain[len(chain)-1]
		if leaf.MimeType != MimeFolder {
			return nil, apperr.BadRequest("El elemento seleccionado no es una carpeta.")
		}
		if leaf.IsShortcut {
			return nil, apperr.BadRequest("No se pueden seleccionar atajos como carpeta raíz.")
		}
		names := make([]string, 0, len(chain))
		ancestors := map[string]bool{}
		for i, item := range chain {
			names = append(names, item.Name)
			if i < len(chain)-1 {
				ancestors[item.ID] = true
			}
		}
		folders = append(folders, folderCandidate{
			Root:      Root{GoogleID: id, Name: leaf.Name, SourcePath: strings.Join(names, "/")},
			ancestors: ancestors,
		})
	}

	files := make([]fileCandidate, 0, len(fileIDs))
	for _, id := range fileIDs {
		if id == "root" || id == rootID {
			return nil, apperr.BadRequest("El elemento seleccionado no es un archivo.")
		}
		chain, err := api.PathToRoot(ctx, id)
		if err != nil {
			return nil, translateAPI(err)
		}
		if len(chain) == 0 {
			return nil, apperr.BadRequest("Archivo inválido.")
		}
		leaf := chain[len(chain)-1]
		if leaf.ID != id {
			return nil, apperr.BadRequest("El identificador de Drive no corresponde al archivo.")
		}
		if leaf.Trashed {
			return nil, apperr.BadRequest("El archivo seleccionado está en la papelera.")
		}
		if leaf.MimeType == MimeFolder {
			return nil, apperr.BadRequest("El elemento seleccionado es una carpeta; use root_folder_ids.")
		}
		if leaf.IsShortcut {
			return nil, apperr.BadRequest("No se pueden seleccionar atajos como archivo descargable.")
		}
		if leaf.MimeType == MimeVids {
			return nil, apperr.BadRequest("Google Vids no está soportado en esta versión.")
		}
		if IsNative(leaf.MimeType) {
			if _, ok := ExportMime(leaf.MimeType); !ok {
				return nil, apperr.BadRequest("El tipo de archivo nativo no admite exportación.")
			}
			if leaf.MimeType != MimeForm && !leaf.CanDownload {
				return nil, apperr.BadRequest("Google Drive no permite exportar este archivo.")
			}
		} else if !leaf.CanDownload {
			return nil, apperr.BadRequest("Google Drive no permite descargar este archivo.")
		}
		names := make([]string, 0, len(chain))
		ancestors := map[string]bool{}
		for i, item := range chain {
			names = append(names, item.Name)
			if i < len(chain)-1 {
				ancestors[item.ID] = true
			}
		}
		files = append(files, fileCandidate{
			FileRoot: FileRoot{
				GoogleID: id, Name: leaf.Name, SourcePath: strings.Join(names, "/"),
				MimeType: leaf.MimeType, Size: leaf.Size, ModifiedTime: leaf.ModifiedTime,
				RevisionID: leaf.RevisionID, CanDownload: leaf.CanDownload,
			},
			ancestors: ancestors,
		})
	}

	selectedFolders := map[string]bool{}
	for _, folder := range folders {
		selectedFolders[folder.GoogleID] = true
	}

	// Una carpeta seleccionada cubre los archivos que están dentro de ella.
	keptFiles := make([]FileRoot, 0, len(files))
	for _, file := range files {
		covered := false
		for folderID := range selectedFolders {
			if file.ancestors[folderID] {
				covered = true
				break
			}
		}
		if !covered {
			keptFiles = append(keptFiles, file.FileRoot)
		}
	}
	if len(keptFiles) == 0 && len(files) > 0 && len(folders) == 0 {
		// Todas las selecciones eran archivos cubiertos por carpetas: no ocurre
		// sin carpetas, pero mantiene el error explícito ante datos inconsistentes.
		return nil, apperr.BadRequest("La selección de archivos quedó vacía después de normalizar.")
	}

	// Conserva únicamente las carpetas raíz (elimina descendientes anidadas).
	keptFolders := make([]Root, 0, len(folders))
	for _, folder := range folders {
		nested := false
		for other := range selectedFolders {
			if other != folder.GoogleID && folder.ancestors[other] {
				nested = true
				break
			}
		}
		if !nested {
			keptFolders = append(keptFolders, folder.Root)
		}
	}
	if len(keptFolders) == 0 && len(keptFiles) == 0 {
		return nil, apperr.BadRequest("La selección quedó vacía después de normalizar.")
	}
	return &Selection{Folders: keptFolders, Files: keptFiles}, nil
}
