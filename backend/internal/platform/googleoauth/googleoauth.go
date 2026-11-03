package googleoauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"terra/internal/platform/config"
)

const userInfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

type Identity struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
}

type Client struct {
	login *oauth2.Config
	drive *oauth2.Config
	http  *http.Client
}

func New(cfg config.Config) *Client {
	login := &oauth2.Config{
		ClientID:     cfg.Google.ClientID,
		ClientSecret: cfg.Google.ClientSecret,
		RedirectURL:  cfg.Google.RedirectURL,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
	driveScopes := append([]string{}, cfg.Google.DriveScopes...)
	driveScopes = append(driveScopes, "openid", "email")
	drive := &oauth2.Config{
		ClientID:     cfg.Google.ClientID,
		ClientSecret: cfg.Google.ClientSecret,
		RedirectURL:  cfg.Google.DriveRedirectURL,
		Scopes:       driveScopes,
		Endpoint:     google.Endpoint,
	}
	return &Client{login: login, drive: drive, http: &http.Client{Timeout: 20 * time.Second}}
}

func (g *Client) LoginURL(state, codeVerifier string) string {
	return g.login.AuthCodeURL(state,
		oauth2.AccessTypeOnline,
		oauth2.SetAuthURLParam("code_challenge", pkceChallenge(codeVerifier)),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
}

func (g *Client) DriveURL(state, codeVerifier string) string {
	return g.drive.AuthCodeURL(state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("code_challenge", pkceChallenge(codeVerifier)),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
		oauth2.SetAuthURLParam("prompt", "consent"),
		oauth2.SetAuthURLParam("include_granted_scopes", "true"),
	)
}

func (g *Client) Exchange(ctx context.Context, code, verifier string, driveFlow bool) (*oauth2.Token, error) {
	cfg := g.login
	if driveFlow {
		cfg = g.drive
	}
	tok, err := cfg.Exchange(ctx, code, oauth2.SetAuthURLParam("code_verifier", verifier))
	if err != nil {
		return nil, fmt.Errorf("oauth exchange: %w", err)
	}
	return tok, nil
}

func (g *Client) UserInfo(ctx context.Context, token *oauth2.Token) (*Identity, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, userInfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	resp, err := g.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("userinfo status %d: %s", resp.StatusCode, string(body))
	}
	var id Identity
	if err := json.NewDecoder(resp.Body).Decode(&id); err != nil {
		return nil, err
	}
	if id.Subject == "" {
		return nil, errors.New("userinfo sin subject")
	}
	return &id, nil
}

// RevokeToken asks Google to invalidate a refresh or access token.
func (g *Client) RevokeToken(ctx context.Context, token string) error {
	resp, err := g.http.PostForm("https://oauth2.googleapis.com/revoke", url.Values{"token": {token}})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("revoke status %d", resp.StatusCode)
	}
	return nil
}

func (g *Client) Scopes() []string { return g.drive.Scopes }

func PKCEChallenge(verifier string) string { return pkceChallenge(verifier) }

func SanitizeRedirect(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || !strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "//") || strings.Contains(raw, "\\") {
		return ""
	}
	return raw
}

func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// TokenSource returns a refreshing source for a stored Drive refresh token.
func (g *Client) TokenSource(ctx context.Context, refreshToken string) oauth2.TokenSource {
	return g.drive.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
}

// DriveScopes exposes the requested documental scopes for verification.
func (g *Client) DriveScopes() []string { return g.drive.Scopes }
