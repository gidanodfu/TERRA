package password

import "testing"

func TestHashVerify(t *testing.T) {
	hash, err := Hash("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "correct horse battery staple" {
		t.Fatal("password stored in plaintext")
	}
	if !Verify(hash, "correct horse battery staple") {
		t.Fatal("valid password rejected")
	}
	if Verify(hash, "wrong password") {
		t.Fatal("invalid password accepted")
	}
}

func TestVerifyRejectsMalformedHash(t *testing.T) {
	for _, encoded := range []string{"", "plaintext", "$argon2id$v=19$m=1,t=1,p=1$bad$bad"} {
		if Verify(encoded, "whatever") {
			t.Fatalf("malformed hash accepted: %q", encoded)
		}
	}
}

func TestValidateStrength(t *testing.T) {
	if ValidateStrength("short") == nil {
		t.Fatal("short password accepted")
	}
	if ValidateStrength("long-enough-password") != nil {
		t.Fatal("valid password rejected")
	}
}
