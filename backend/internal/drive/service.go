package drive

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/platform/crypto"
	"terra/internal/platform/googleoauth"
	"terra/internal/platform/oauthstate"
	"terra/internal/users"
)

type Service struct {
	cfg      config.Config
	repo     *Repository
	users    *users.Repository
	google   *googleoauth.Client
	states   *oauthstate.Repository
	provider *Provider
	box      *crypto.Box
	audit    *audit.Repository
}

func NewService(cfg config.Config, repo *Repository, usersRepo *users.Repository, google *googleoauth.Client,
	states *oauthstate.Repository, provider *Provider, box *crypto.Box, auditRepo *audit.Repository) *Service {
	return &Service{cfg: cfg, repo: repo, users: usersRepo, google: google, states: states,
		provider: provider, box: box, audit: auditRepo}
}

func (s *Service) Connection(ctx context.Context, userID uuid.UUID) (*Connection, error) {
	return s.repo.GetByUser(ctx, userID)
}

func (s *Service) StartConnect(ctx context.Context, userID uuid.UUID, redirectAfter string) (string, string, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", "", err
	}
	if user.Status != users.StatusActive {
		return "", "", apperr.Forbidden("Debe completar su perfil antes de conectar Google Drive.")
	}
	rawState, err := crypto.RandomToken(32)
	if err != nil {
		return "", "", err
	}
	verifier, err := crypto.RandomToken(48)
	if err != nil {
		return "", "", err
	}
	if err := s.states.Create(ctx, crypto.HashToken(rawState), oauthstate.FlowDriveConnect, &userID,
		verifier, redirectAfter, time.Now().Add(10*time.Minute)); err != nil {
		return "", "", err
	}
	return s.google.DriveURL(rawState, verifier), rawState, nil
}

func (s *Service) CompleteConnect(ctx context.Context, rawState, code, ipHash string) (*Connection, error) {
	state, err := s.states.Consume(ctx, crypto.HashToken(rawState), oauthstate.FlowDriveConnect)
	if err != nil {
		return nil, err
	}
	if state.UserID == nil {
		return nil, apperr.BadRequest("Estado de autorización inválido.")
	}
	user, err := s.users.GetByID(ctx, *state.UserID)
	if err != nil {
		return nil, err
	}
	if user.Status != users.StatusActive {
		return nil, apperr.Forbidden("La cuenta no puede conectar Drive en su estado actual.")
	}
	token, err := s.google.Exchange(ctx, code, state.CodeVerifier, true)
	if err != nil {
		return nil, apperr.BadRequest("No fue posible completar la autorización de Drive.")
	}
	identity, err := s.google.UserInfo(ctx, token)
	if err != nil {
		return nil, apperr.BadRequest("No fue posible verificar la cuenta de Google autorizada.")
	}
	// La autorización de Drive debe pertenecer a la misma cuenta de Google que inicia sesión en TERRA.
	owner, err := s.users.GetByGoogleSubject(ctx, identity.Subject)
	if err != nil || owner.ID != user.ID {
		return nil, apperr.Conflict("drive_account_mismatch",
			"La cuenta de Google autorizada no corresponde a la cuenta con la que inició sesión.")
	}
	scopeRaw, _ := token.Extra("scope").(string)
	granted := strings.Fields(scopeRaw)
	if len(granted) == 0 {
		return nil, apperr.BadRequest("Google no confirmó los permisos otorgados. Intente nuevamente.")
	}
	for _, required := range s.cfg.Google.DriveScopes {
		if !contains(granted, required) {
			return nil, apperr.BadRequest("No se otorgó el permiso de lectura de Google Drive requerido.")
		}
	}
	var ciphertext []byte
	if token.RefreshToken != "" {
		ciphertext, err = s.box.Seal([]byte(token.RefreshToken))
		if err != nil {
			return nil, err
		}
	}
	conn, err := s.repo.Upsert(ctx, user.ID, identity.Subject, identity.Email, ciphertext, scopeRaw)
	if err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &user.ID, Action: "drive.connected", TargetType: "drive_connection",
		TargetID: conn.ID.String(), Metadata: map[string]any{"email": identity.Email}, IPHash: ipHash})
	return conn, nil
}

func (s *Service) Disconnect(ctx context.Context, userID uuid.UUID, ipHash string) error {
	conn, err := s.repo.GetByUser(ctx, userID)
	if err != nil {
		return err
	}
	if len(conn.RefreshCiphertext) > 0 {
		if refresh, derr := s.box.Open(conn.RefreshCiphertext); derr == nil {
			revokeCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			_ = s.google.RevokeToken(revokeCtx, string(refresh))
			cancel()
		}
	}
	if err := s.repo.Revoke(ctx, conn.ID); err != nil {
		return err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &userID, Action: "drive.disconnected", TargetType: "drive_connection",
		TargetID: conn.ID.String(), IPHash: ipHash})
	return nil
}

func (s *Service) AcceptPolicy(ctx context.Context, userID uuid.UUID, version, ipHash string) (*Connection, error) {
	latest, err := s.repo.LatestPolicy(ctx)
	if err != nil {
		return nil, err
	}
	if version != latest.Version {
		return nil, apperr.Conflict("policy_version_mismatch",
			"La versión de la política cambió. Recargue la página y vuelva a aceptarla.")
	}
	if err := s.repo.SetConsent(ctx, userID, version); err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &userID, Action: "policy.accepted", TargetType: "policy",
		TargetID: version, IPHash: ipHash})
	return s.repo.GetByUser(ctx, userID)
}

func (s *Service) LatestPolicy(ctx context.Context) (*Policy, error) {
	return s.repo.LatestPolicy(ctx)
}

func (s *Service) CreatePolicy(ctx context.Context, actor uuid.UUID, version, content, ipHash string) (*Policy, error) {
	version = strings.TrimSpace(version)
	content = strings.TrimSpace(content)
	fields := map[string]string{}
	if version == "" {
		fields["version"] = "Indique una versión."
	}
	if content == "" {
		fields["content"] = "El contenido es obligatorio."
	}
	if len(fields) > 0 {
		return nil, apperr.Invalid("Revise la política institucional.", fields)
	}
	p, err := s.repo.CreatePolicy(ctx, version, content, actor)
	if err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &actor, Action: "policy.published", TargetType: "policy",
		TargetID: p.Version, IPHash: ipHash})
	return p, nil
}

// EnsureReady bloquea la exploración y la descarga hasta que la conexión y el consentimiento de política estén vigentes.
func (s *Service) EnsureReady(ctx context.Context, conn *Connection) error {
	latest, err := s.repo.LatestPolicy(ctx)
	if err != nil {
		if e, ok := err.(*apperr.Error); ok && e.Status == 404 {
			return apperr.Conflict("policy_not_published",
				"No existe una política institucional publicada. Un administrador debe publicarla.")
		}
		return err
	}
	if conn.Status != StatusConnected || !conn.HasRefreshToken {
		return apperr.Conflict("drive_reauthorization_required",
			"El trabajador debe reconectar su cuenta de Google Drive.")
	}
	if conn.PolicyVersion != latest.Version {
		return apperr.Conflict("policy_consent_required",
			"El trabajador debe aceptar la versión vigente de la política institucional.")
	}
	return nil
}

func (s *Service) EnsureReadyForUser(ctx context.Context, userID uuid.UUID) (*Connection, error) {
	conn, err := s.repo.GetByUser(ctx, userID)
	if err != nil {
		return nil, apperr.Conflict("drive_not_connected", "El trabajador no tiene una conexión de Google Drive.")
	}
	if err := s.EnsureReady(ctx, conn); err != nil {
		return nil, err
	}
	return conn, nil
}

type BrowseResult struct {
	ParentID   string       `json:"parent_id"`
	ParentName string       `json:"parent_name"`
	Path       []string     `json:"path"`
	IsRoot     bool         `json:"is_root"`
	Folders    []FolderItem `json:"folders"`
}

func (s *Service) Browse(ctx context.Context, ownerID uuid.UUID, parentID string) (*BrowseResult, error) {
	conn, err := s.EnsureReadyForUser(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	api, err := s.provider.NewAPI(ctx, conn)
	if err != nil {
		return nil, apperr.Conflict("drive_reauthorization_required", "El trabajador debe reconectar su cuenta de Google Drive.")
	}
	if parentID == "" {
		parentID = "root"
	}
	rootID, err := api.RootID(ctx)
	if err != nil {
		return nil, translateAPI(err)
	}
	isRoot := parentID == "root" || parentID == rootID
	var path []string
	name := "Mi unidad"
	if !isRoot {
		chain, err := api.PathToRoot(ctx, parentID)
		if err != nil {
			return nil, translateAPI(err)
		}
		for _, f := range chain {
			path = append(path, f.Name)
		}
		if len(chain) > 0 {
			name = chain[len(chain)-1].Name
		}
	}
	folders, err := api.ListFolders(ctx, parentID)
	if err != nil {
		return nil, translateAPI(err)
	}
	if folders == nil {
		folders = []FolderItem{}
	}
	return &BrowseResult{ParentID: parentID, ParentName: name, Path: path, IsRoot: isRoot, Folders: folders}, nil
}

// NormalizeRoots valida los IDs de Drive y elimina los descendientes de raíces ya seleccionadas.
func (s *Service) NormalizeRoots(ctx context.Context, ownerID uuid.UUID, ids []string) ([]Root, error) {
	conn, err := s.EnsureReadyForUser(ctx, ownerID)
	if err != nil {
		return nil, err
	}
	ids = dedupe(ids)
	if len(ids) == 0 {
		return nil, apperr.Invalid("Seleccione al menos una carpeta.",
			map[string]string{"root_folder_ids": "Seleccione al menos una carpeta."})
	}
	if len(ids) > 100 {
		return nil, apperr.Invalid("Seleccione como máximo 100 carpetas.", nil)
	}
	api, err := s.provider.NewAPI(ctx, conn)
	if err != nil {
		return nil, apperr.Conflict("drive_reauthorization_required", "El trabajador debe reconectar su cuenta de Google Drive.")
	}
	rootID, err := api.RootID(ctx)
	if err != nil {
		return nil, translateAPI(err)
	}
	type candidate struct {
		Root
		ancestors map[string]bool
	}
	var candidates []candidate
	for _, id := range ids {
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
		anc := map[string]bool{}
		for i, f := range chain {
			names = append(names, f.Name)
			if i < len(chain)-1 {
				anc[f.ID] = true
			}
		}
		candidates = append(candidates, candidate{
			Root:      Root{GoogleID: id, Name: leaf.Name, SourcePath: strings.Join(names, "/")},
			ancestors: anc,
		})
	}
	selected := map[string]bool{}
	for _, c := range candidates {
		selected[c.GoogleID] = true
	}
	var out []Root
	for _, c := range candidates {
		nested := false
		for other := range selected {
			if other != c.GoogleID && c.ancestors[other] {
				nested = true
				break
			}
		}
		if !nested {
			out = append(out, c.Root)
		}
	}
	if len(out) == 0 {
		return nil, apperr.BadRequest("La selección de carpetas quedó vacía después de normalizar.")
	}
	return out, nil
}

func (s *Service) AdminConnection(ctx context.Context, ownerID uuid.UUID) (*Connection, error) {
	return s.repo.GetByUser(ctx, ownerID)
}

func (s *Service) AdminConnections(ctx context.Context, status string, page, size int) ([]AdminConnectionRow, int, error) {
	rows, total, err := s.repo.AdminList(ctx, status, page, size)
	if rows == nil {
		rows = []AdminConnectionRow{}
	}
	return rows, total, err
}

func translateAPI(err error) error {
	apiErr := Translate(err)
	switch {
	case apiErr.Reauth:
		return apperr.Conflict("drive_reauthorization_required", "El trabajador debe reconectar su cuenta de Google Drive.")
	case apiErr.Code == "not_in_my_drive":
		return apperr.BadRequest("El elemento no pertenece a Mi unidad de esta conexión.")
	case apiErr.Code == "not_downloadable":
		return apperr.BadRequest("El elemento no se puede descargar.")
	default:
		return apperr.New(502, "drive_error", "No fue posible consultar Google Drive. Intente nuevamente.")
	}
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func dedupe(items []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" && !seen[item] {
			seen[item] = true
			out = append(out, item)
		}
	}
	return out
}

// IsReauth informa si un error de la API requiere que el propietario vuelva a conectar.
func IsReauth(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Reauth
	}
	return false
}
