package crypto

import (
	"bytes"
	"testing"
)

func testBox(t *testing.T) *Box {
	t.Helper()
	key := bytes.Repeat([]byte{7}, 32)
	box, err := NewBox(key)
	if err != nil {
		t.Fatal(err)
	}
	return box
}

func TestSealOpenRoundTrip(t *testing.T) {
	box := testBox(t)
	secret := []byte("1//refresh-token-value")
	sealed, err := box.Seal(secret)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, secret) {
		t.Fatal("plaintext leaked into ciphertext")
	}
	opened, err := box.Open(sealed)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(opened, secret) {
		t.Fatalf("got %q", opened)
	}
}

func TestOpenRejectsTampering(t *testing.T) {
	box := testBox(t)
	sealed, _ := box.Seal([]byte("secret"))
	sealed[len(sealed)-1] ^= 0xff
	if _, err := box.Open(sealed); err == nil {
		t.Fatal("tampered ciphertext accepted")
	}
}

func TestNewBoxRejectsWrongKeyLength(t *testing.T) {
	if _, err := NewBox([]byte("short")); err == nil {
		t.Fatal("short key accepted")
	}
}

func TestHashTokenIsStableAndNotReversible(t *testing.T) {
	a := HashToken("token")
	b := HashToken("token")
	if !bytes.Equal(a, b) {
		t.Fatal("hash not stable")
	}
	if bytes.Contains(a, []byte("token")) {
		t.Fatal("hash exposes token")
	}
	if bytes.Equal(a, HashToken("other")) {
		t.Fatal("hash collision")
	}
}
