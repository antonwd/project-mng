package helper

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestCertbotIssue_HappyPath(t *testing.T) {
	runner := &FakeRunner{
		Responses: []FakeResponse{
			{ExitCode: 0, Stdout: []byte("Successfully received certificate.\n")},
		},
	}
	h := &Handlers{
		Cfg: Config{
			CertbotBin:  "/usr/bin/certbot",
			AcmeWebroot: "/var/www/_acme",
		},
		Runner: runner,
	}
	resp := h.CertbotIssue(context.Background(), json.RawMessage(
		`{"domain":"example.com","email":"you@example.com"}`,
	))
	if !resp.OK {
		t.Fatalf("expected ok, got %+v", resp)
	}
	if len(runner.Calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(runner.Calls))
	}
	args := runner.Calls[0].Args
	expectedArgs := []string{
		"certonly", "--webroot",
		"-w", "/var/www/_acme",
		"-d", "example.com",
		"-n", "--agree-tos",
		"--email", "you@example.com",
	}
	if len(args) != len(expectedArgs) {
		t.Fatalf("arg count mismatch: got %v want %v", args, expectedArgs)
	}
	for i := range args {
		if args[i] != expectedArgs[i] {
			t.Fatalf("arg[%d] mismatch: got %q want %q", i, args[i], expectedArgs[i])
		}
	}
}

func TestCertbotIssue_RejectsInvalidDomain(t *testing.T) {
	runner := &FakeRunner{}
	h := &Handlers{Cfg: Config{CertbotBin: "/usr/bin/certbot", AcmeWebroot: "/v"}, Runner: runner}
	resp := h.CertbotIssue(context.Background(), json.RawMessage(
		`{"domain":"*.example.com","email":"you@example.com"}`,
	))
	if resp.OK || resp.Error != "validation_failed" {
		t.Fatalf("expected validation_failed, got %+v", resp)
	}
	if len(runner.Calls) != 0 {
		t.Fatalf("certbot should not have been invoked, got %d calls", len(runner.Calls))
	}
}

func TestCertbotIssue_RejectsInvalidEmail(t *testing.T) {
	runner := &FakeRunner{}
	h := &Handlers{Cfg: Config{CertbotBin: "/usr/bin/certbot", AcmeWebroot: "/v"}, Runner: runner}
	resp := h.CertbotIssue(context.Background(), json.RawMessage(
		`{"domain":"example.com","email":"not-an-email"}`,
	))
	if resp.OK || resp.Error != "validation_failed" {
		t.Fatalf("expected validation_failed, got %+v", resp)
	}
}

func TestCertbotIssue_PropagatesStderrOnFailure(t *testing.T) {
	runner := &FakeRunner{
		Responses: []FakeResponse{
			{ExitCode: 1, Stderr: []byte("rate limit exceeded for example.com")},
		},
	}
	h := &Handlers{Cfg: Config{CertbotBin: "/usr/bin/certbot", AcmeWebroot: "/v"}, Runner: runner}
	resp := h.CertbotIssue(context.Background(), json.RawMessage(
		`{"domain":"example.com","email":"you@example.com"}`,
	))
	if resp.OK || resp.Error != "certbot_issue_failed" {
		t.Fatalf("expected certbot_issue_failed, got %+v", resp)
	}
	if !strings.Contains(resp.Stderr, "rate limit") {
		t.Fatalf("expected stderr propagated, got %q", resp.Stderr)
	}
}

func TestCertbotRenew_HappyPath(t *testing.T) {
	runner := &FakeRunner{
		Responses: []FakeResponse{
			{ExitCode: 0, Stdout: []byte("No renewals were attempted.\n")},
		},
	}
	h := &Handlers{
		Cfg: Config{
			CertbotBin:  "/usr/bin/certbot",
			AcmeWebroot: "/var/www/_acme",
		},
		Runner: runner,
	}
	resp := h.CertbotRenew(context.Background())
	if !resp.OK {
		t.Fatalf("expected ok, got %+v", resp)
	}
	if len(runner.Calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(runner.Calls))
	}
	args := runner.Calls[0].Args
	expected := []string{"renew", "--webroot", "-w", "/var/www/_acme", "-n", "--no-random-sleep-on-renew"}
	if len(args) != len(expected) {
		t.Fatalf("arg count: got %v want %v", args, expected)
	}
	for i := range args {
		if args[i] != expected[i] {
			t.Fatalf("arg[%d]: got %q want %q", i, args[i], expected[i])
		}
	}
}

func TestCertbotRenew_FailurePropagatesStderr(t *testing.T) {
	runner := &FakeRunner{
		Responses: []FakeResponse{
			{ExitCode: 1, Stderr: []byte("DNS challenge failed for foo.example")},
		},
	}
	h := &Handlers{Cfg: Config{CertbotBin: "/usr/bin/certbot", AcmeWebroot: "/v"}, Runner: runner}
	resp := h.CertbotRenew(context.Background())
	if resp.OK || resp.Error != "certbot_renew_failed" {
		t.Fatalf("expected certbot_renew_failed, got %+v", resp)
	}
}
