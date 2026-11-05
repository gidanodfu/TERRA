package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"terra/internal/audit"
	"terra/internal/platform/apperr"
	"terra/internal/platform/config"
	"terra/internal/platform/crypto"
	"terra/internal/platform/googleoauth"
	"terra/internal/platform/httpx"
	"terra/internal/platform/oauthstate"
	"terra/internal/platform/password"
	"terra/internal/platform/principal"
	"terra/internal/platform/ratelimit"
	"terra/internal/platform/rbac"
	"terra/internal/users"
)

type Service struct {
	cfg       config.Config
	repo      *Repository
	users     *users.Repository
	google    *googleoauth.Client
	states    *oauthstate.Repository
	turnstile *Turnstile
	audit     *audit.Repository
	ipLimiter *ratelimit.Limiter
	idLimiter *ratelimit.Limiter
	dummyHash string
}

type LoginResult struct {
	User       *users.User
	RawToken   string
	CSRF       string
	ExpiresAt  time.Time
	MustRotate bool
	Pending    bool
}

func NewService(cfg config.Config, repo *Repository, usersRepo *users.Repository, google *googleoauth.Client,
	states *oauthstate.Repository, turnstile *Turnstile, auditRepo *audit.Repository) *Service {
	dummy, _ := password.Hash("terra-dummy-password-never-used")
	return &Service{
		cfg: cfg, repo: repo, users: usersRepo, google: google, states: states,
		turnstile: turnstile, audit: auditRepo,
		ipLimiter: ratelimit.New(15, 15*time.Minute),
		idLimiter: ratelimit.New(6, 15*time.Minute),
		dummyHash: dummy,
	}
}

func (s *Service) StartLogin(ctx context.Context) (authURL, rawState string, err error) {
	rawState, err = crypto.RandomToken(32)
	if err != nil {
		return "", "", err
	}
	verifier, err := crypto.RandomToken(48)
	if err != nil {
		return "", "", err
	}
	if err := s.states.Create(ctx, crypto.HashToken(rawState), oauthstate.FlowLogin, nil, verifier, "",
		time.Now().Add(10*time.Minute)); err != nil {
		return "", "", err
	}
	return s.google.LoginURL(rawState, verifier), rawState, nil
}

type CompleteLoginResult struct {
	Login      *LoginResult
	Pending    bool
	RedirectTo string
}

func (s *Service) CompleteLogin(ctx context.Context, rawState, code, userAgent, ipHash string) (*CompleteLoginResult, error) {
	state, err := s.states.Consume(ctx, crypto.HashToken(rawState), oauthstate.FlowLogin)
	if err != nil {
		return nil, err
	}
	token, err := s.google.Exchange(ctx, code, state.CodeVerifier, false)
	if err != nil {
		return nil, apperr.Unauthorized("No fue posible completar la autorización con Google.")
	}
	identity, err := s.google.UserInfo(ctx, token)
	if err != nil {
		return nil, apperr.Unauthorized("No fue posible verificar la identidad de Google.")
	}
	if !identity.EmailVerified || identity.Email == "" {
		return nil, apperr.Forbidden("La cuenta de Google debe tener un correo verificado.")
	}

	user, err := s.users.GetByGoogleSubject(ctx, identity.Subject)
	if err != nil {
		var e *apperr.Error
		if !errors.As(err, &e) || e.Status != http.StatusNotFound {
			return nil, err
		}
		// Vincula un correo de Google verificado con una cuenta TERRA existente solo cuando aún
		// no tiene identidad de Google; en caso contrario, crea un perfil pendiente nuevo.
		existing, findByEmailErr := s.users.GetByEmail(ctx, identity.Email)
		switch {
		case findByEmailErr == nil:
			if attachErr := s.users.AttachGoogleIdentity(ctx, existing.ID, identity.Subject); attachErr != nil {
				return nil, attachErr
			}
			// Nunca mezcles una cuenta administrativa (o desconocida) con el rol de
			// trabajador. Las cuentas mixtas se clasifican como administrativas y se excluyen.
			if existing.IsWorker() || len(existing.Roles) == 0 {
				_ = s.users.EnsureRole(ctx, existing.ID, string(users.RoleUser))
			}
			user = existing
		case isNotFound(findByEmailErr):
			display := identity.Name
			if display == "" {
				display = identity.Email
			}
			user, err = s.users.CreateGoogleUser(ctx, identity.Email, display, identity.Subject)
			if err != nil {
				return nil, err
			}
		default:
			return nil, findByEmailErr
		}
	}

	if user.Status == users.StatusSuspended || user.Status == users.StatusDisabled {
		return nil, apperr.Forbidden("La cuenta se encuentra suspendida o desactivada.")
	}

	_ = s.users.TouchIdentity(ctx, user.ID)
	_ = s.users.TouchLogin(ctx, user.ID)
	s.users.SetDisplayNameIfEmpty(ctx, user.ID, identity.Name)

	login, err := s.issueSession(ctx, user, userAgent, ipHash)
	if err != nil {
		return nil, err
	}
	redirect := "/app"
	if user.Status == users.StatusPendingProfile {
		redirect = "/onboarding"
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &user.ID, Action: "auth.google.login",
		TargetType: "user", TargetID: user.ID.String(), Metadata: map[string]any{"provider": "google"}, IPHash: ipHash})
	return &CompleteLoginResult{Login: login, Pending: user.Status == users.StatusPendingProfile, RedirectTo: redirect}, nil
}

func (s *Service) AdminLogin(ctx context.Context, ip, username, plainPassword, turnstileToken, userAgent string) (*LoginResult, error) {
	if !s.ipLimiter.Allow("ip:" + ip) {
		return nil, apperr.TooManyRequests("Demasiados intentos. Espere unos minutos antes de reintentar.")
	}
	if !s.idLimiter.Allow("user:" + strings.ToLower(strings.TrimSpace(username))) {
		return nil, apperr.TooManyRequests("Demasiados intentos para esta cuenta. Espere unos minutos.")
	}
	if err := s.turnstile.Verify(ctx, turnstileToken, ip); err != nil {
		s.audit.Record(ctx, audit.Event{Action: "auth.admin.login_failed", TargetType: "user",
			Metadata: map[string]any{"username": username, "reason": "turnstile"}, IPHash: ip})
		return nil, err
	}

	cred, err := s.repo.GetLocalCredential(ctx, strings.TrimSpace(username))
	if err != nil {
		_ = password.Verify(s.dummyHash, plainPassword)
		return nil, apperr.Unauthorized("Usuario o contraseña incorrectos.")
	}
	if !password.Verify(cred.PasswordHash, plainPassword) {
		s.audit.Record(ctx, audit.Event{Action: "auth.admin.login_failed", TargetType: "user",
			Metadata: map[string]any{"username": username, "reason": "credentials"}, IPHash: ip})
		return nil, apperr.Unauthorized("Usuario o contraseña incorrectos.")
	}
	user, err := s.users.GetByID(ctx, cred.UserID)
	if err != nil {
		return nil, err
	}
	if _, ok := rbac.AdministrativeRole(user.Roles); !ok {
		s.audit.Record(ctx, audit.Event{Action: "auth.admin.login_failed", TargetType: "user",
			Metadata: map[string]any{"username": username, "reason": "not_administrative"}, IPHash: ip})
		return nil, apperr.Forbidden("La cuenta no tiene acceso administrativo.")
	}
	if user.Status != users.StatusActive {
		s.audit.Record(ctx, audit.Event{Action: "auth.admin.login_failed", TargetType: "user",
			Metadata: map[string]any{"username": username, "reason": "inactive"}, IPHash: ip})
		return nil, apperr.Forbidden("La cuenta se encuentra suspendida o desactivada.")
	}
	_ = s.users.TouchLogin(ctx, user.ID)
	login, err := s.issueSession(ctx, user, userAgent, ip)
	if err != nil {
		return nil, err
	}
	s.audit.Record(ctx, audit.Event{ActorUserID: &user.ID, Action: "auth.admin.login",
		TargetType: "user", TargetID: user.ID.String(), IPHash: ip})
	return login, nil
}

func (s *Service) issueSession(ctx context.Context, user *users.User, userAgent, ipHash string) (*LoginResult, error) {
	rawToken, err := crypto.RandomToken(32)
	if err != nil {
		return nil, err
	}
	csrf, err := crypto.RandomToken(24)
	if err != nil {
		return nil, err
	}
	expires := time.Now().Add(s.cfg.SessionTTL)
	if _, err := s.repo.CreateSession(ctx, user.ID, crypto.HashToken(rawToken), csrf, expires, userAgent, ipHash); err != nil {
		return nil, err
	}
	mustRotate, _ := s.repo.HasLocalCredentialFlag(ctx, user.ID)
	return &LoginResult{
		User: user, RawToken: rawToken, CSRF: csrf, ExpiresAt: expires,
		MustRotate: mustRotate, Pending: user.Status == users.StatusPendingProfile,
	}, nil
}

func (s *Service) Logout(ctx context.Context, rawToken string, userID string, ipHash string) {
	s.repo.DeleteSession(ctx, crypto.HashToken(rawToken))
	s.audit.Record(ctx, audit.Event{Action: "auth.logout", TargetType: "session",
		Metadata: map[string]any{"user_id": userID}, IPHash: ipHash})
}

func (s *Service) ChangePassword(ctx context.Context, userID uuid.UUID, sessionToken, current, next, ipHash string) error {
	cred, err := s.repo.GetLocalCredentialByUserID(ctx, userID)
	if err != nil {
		return err
	}
	if !password.Verify(cred.PasswordHash, current) {
		return apperr.Invalid("La contraseña actual no es correcta.", map[string]string{"current_password": "Contraseña incorrecta."})
	}
	if err := password.ValidateStrength(next); err != nil {
		return apperr.Invalid("La nueva contraseña no cumple la política.", map[string]string{"new_password": err.Error()})
	}
	if next == current {
		return apperr.Invalid("La nueva contraseña debe ser diferente.", map[string]string{"new_password": "Debe ser diferente a la actual."})
	}
	hash, err := password.Hash(next)
	if err != nil {
		return err
	}
	if err := s.repo.UpdatePassword(ctx, userID, hash); err != nil {
		return err
	}
	s.repo.DeleteOtherSessions(ctx, userID, crypto.HashToken(sessionToken))
	s.audit.Record(ctx, audit.Event{ActorUserID: &userID, Action: "auth.password.changed",
		TargetType: "user", TargetID: userID.String(), IPHash: ipHash})
	return nil
}

func (s *Service) Me(ctx context.Context, identity principal.Identity) (map[string]any, error) {
	hasLocalCredentials, err := s.repo.HasLocalCredential(ctx, identity.ID)
	if err != nil {
		return nil, err
	}
	mustRotate := false
	if hasLocalCredentials {
		mustRotate, err = s.repo.HasLocalCredentialFlag(ctx, identity.ID)
		if err != nil {
			return nil, err
		}
	}
	fullUser, err := s.users.GetByID(ctx, identity.ID)
	if err != nil {
		// La sesión es válida pero no se pudo leer el perfil; devuelve la identidad
		// mínima en lugar de fallar todo el shell de la aplicación.
		fullUser = &users.User{ID: identity.ID, FirstName: identity.FirstName, LastName: identity.LastName,
			DisplayName: identity.DisplayName, Email: identity.Email, AreaID: identity.AreaID,
			PositionID: identity.PositionID, Status: users.Status(identity.Status), Roles: identity.Roles}
	}
	return map[string]any{
		"user":                  fullUser,
		"permissions":           PermissionsFor(fullUser.Roles),
		"has_local_credentials": hasLocalCredentials,
		"must_rotate_password":  mustRotate,
		"pending_profile":       fullUser.Status == users.StatusPendingProfile,
	}, nil
}

// --- middleware ---

func (s *Service) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(s.cfg.SessionCookie)
		if err != nil || cookie.Value == "" {
			httpx.WriteError(w, r, apperr.Unauthorized("Debe iniciar sesión."))
			return
		}
		hash := crypto.HashToken(cookie.Value)
		session, err := s.repo.GetSession(r.Context(), hash)
		if err != nil {
			s.clearCookies(w)
			httpx.WriteError(w, r, err)
			return
		}
		user, err := s.users.GetByID(r.Context(), session.UserID)
		if err != nil {
			httpx.WriteError(w, r, err)
			return
		}
		if user.Status == users.StatusSuspended || user.Status == users.StatusDisabled {
			s.repo.DeleteSession(r.Context(), hash)
			s.clearCookies(w)
			httpx.WriteError(w, r, apperr.Forbidden("La cuenta se encuentra suspendida o desactivada."))
			return
		}
		if isUnsafe(r.Method) {
			csrfCookie, cerr := r.Cookie("terra_csrf")
			header := r.Header.Get("X-CSRF-Token")
			if cerr != nil || csrfCookie.Value == "" || header == "" ||
				subtle.ConstantTimeCompare([]byte(csrfCookie.Value), []byte(session.CSRFToken)) != 1 ||
				subtle.ConstantTimeCompare([]byte(header), []byte(session.CSRFToken)) != 1 {
				httpx.WriteError(w, r, apperr.Forbidden("Token CSRF inválido. Recargue la página."))
				return
			}
		}
		s.repo.TouchSession(r.Context(), session.ID)
		ctx := principal.With(r.Context(), principal.Principal{SessionID: session.ID, User: principal.Identity{
			ID: user.ID, FirstName: user.FirstName, LastName: user.LastName, DisplayName: user.DisplayName,
			Email: user.Email, AreaID: user.AreaID, PositionID: user.PositionID, Status: string(user.Status), Roles: user.Roles,
			Permissions: PermissionsFor(user.Roles),
		}})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Service) RequireActive(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := principal.Current(r.Context())
		if !ok {
			httpx.WriteError(w, r, apperr.Unauthorized("Debe iniciar sesión."))
			return
		}
		if user.Status != string(users.StatusActive) {
			httpx.WriteError(w, r, apperr.Forbidden("Debe completar su perfil para continuar."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Service) RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := principal.Current(r.Context())
		if !ok {
			httpx.WriteError(w, r, apperr.Unauthorized("Debe iniciar sesión."))
			return
		}
		if user.Status != string(users.StatusActive) || !user.IsAdmin() {
			httpx.WriteError(w, r, apperr.Forbidden("No tiene permisos para esta operación."))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePermission aplica la matriz RBAC sobre el principal ya autenticado.
func (s *Service) RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := principal.Current(r.Context())
			if !ok {
				httpx.WriteError(w, r, apperr.Unauthorized("Debe iniciar sesión."))
				return
			}
			if user.Status != string(users.StatusActive) || !user.Can(permission) {
				httpx.WriteError(w, r, apperr.Forbidden("No tiene permisos para esta operación."))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isNotFound(err error) bool {
	var e *apperr.Error
	return errors.As(err, &e) && e.Status == http.StatusNotFound
}

func isUnsafe(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	}
	return true
}

func (s *Service) SetSessionCookies(w http.ResponseWriter, result *LoginResult) {
	secure := s.cfg.IsProduction()
	http.SetCookie(w, &http.Cookie{
		Name: s.cfg.SessionCookie, Value: result.RawToken, Path: "/", HttpOnly: true,
		Secure: secure, SameSite: http.SameSiteLaxMode, Expires: result.ExpiresAt, MaxAge: int(time.Until(result.ExpiresAt).Seconds()),
	})
	http.SetCookie(w, &http.Cookie{
		Name: "terra_csrf", Value: result.CSRF, Path: "/", HttpOnly: false,
		Secure: secure, SameSite: http.SameSiteLaxMode, Expires: result.ExpiresAt, MaxAge: int(time.Until(result.ExpiresAt).Seconds()),
	})
}

func (s *Service) ClearSessionCookies(w http.ResponseWriter) { s.clearCookies(w) }

func (s *Service) clearCookies(w http.ResponseWriter) {
	for _, name := range []string{s.cfg.SessionCookie, "terra_csrf", "terra_oauth_state"} {
		http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: name != "terra_csrf",
			Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode})
	}
}

func (s *Service) SetOAuthStateCookie(w http.ResponseWriter, state string) {
	http.SetCookie(w, &http.Cookie{Name: "terra_oauth_state", Value: state, Path: "/", HttpOnly: true,
		Secure: s.cfg.IsProduction(), SameSite: http.SameSiteLaxMode, MaxAge: 600})
}
