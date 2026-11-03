// Package crypto encrypts OAuth refresh tokens at rest and hashes session material.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// Box seals small secrets with AES-256-GCM using a key that never lives in PostgreSQL.
type Box struct{ aead cipher.AEAD }

func NewBox(key []byte) (*Box, error) {
	if len(key) != 32 {
		return nil, errors.New("token encryption key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

func (b *Box) Seal(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return b.aead.Seal(nonce, nonce, plaintext, nil), nil
}

func (b *Box) Open(ciphertext []byte) ([]byte, error) {
	ns := b.aead.NonceSize()
	if len(ciphertext) < ns+1 {
		return nil, errors.New("ciphertext too short")
	}
	return b.aead.Open(nil, ciphertext[:ns], ciphertext[ns:], nil)
}

func HashToken(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func RandomToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func HashIP(ip, secret string) string {
	sum := sha256.Sum256([]byte(secret + "|" + ip))
	return base64.RawURLEncoding.EncodeToString(sum[:16])
}

func MaskEmail(email string) string {
	if email == "" {
		return ""
	}
	at := -1
	for i, r := range email {
		if r == '@' {
			at = i
			break
		}
	}
	if at <= 1 {
		return "***"
	}
	return fmt.Sprintf("%c***%s", email[0], email[at:])
}
