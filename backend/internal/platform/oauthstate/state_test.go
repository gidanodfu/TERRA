package oauthstate

import "testing"

func TestFlowConstants(t *testing.T) {
	if FlowLogin == FlowDriveConnect {
		t.Fatal("login and drive flows must be distinct")
	}
}
