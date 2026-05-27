package helper

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestFakeRunner_RecordsAndReplays(t *testing.T) {
	f := &FakeRunner{
		Responses: []FakeResponse{
			{Stdout: []byte("ok\n"), Stderr: nil, ExitCode: 0},
			{Stdout: nil, Stderr: []byte("nginx: configuration file test failed\n"), ExitCode: 1},
		},
	}
	stdout, stderr, code, err := f.Run(context.Background(), "/usr/sbin/nginx", "-t")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if string(stdout) != "ok\n" || code != 0 || len(stderr) != 0 {
		t.Fatalf("unexpected first call: stdout=%q stderr=%q code=%d", stdout, stderr, code)
	}
	_, stderr, code, err = f.Run(context.Background(), "/usr/sbin/nginx", "-t")
	if err != nil || code != 1 || !strings.Contains(string(stderr), "test failed") {
		t.Fatalf("unexpected second call: stderr=%q code=%d err=%v", stderr, code, err)
	}
	if len(f.Calls) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(f.Calls))
	}
	if f.Calls[0].Name != "/usr/sbin/nginx" || f.Calls[0].Args[0] != "-t" {
		t.Fatalf("unexpected call record: %+v", f.Calls[0])
	}
}

func TestFakeRunner_ExhaustsResponses(t *testing.T) {
	f := &FakeRunner{Responses: nil}
	_, _, _, err := f.Run(context.Background(), "/bin/true")
	if err == nil || !strings.Contains(err.Error(), "no scripted response") {
		t.Fatalf("expected exhaustion error, got %v", err)
	}
}

func TestRealRunner_RejectsRelativePath(t *testing.T) {
	r := &RealRunner{}
	_, _, _, err := r.Run(context.Background(), "true")
	if err == nil || !strings.Contains(err.Error(), "absolute") {
		t.Fatalf("expected absolute-path error, got %v", err)
	}
}

func TestRealRunner_RunsAbsoluteBinaryWithContext(t *testing.T) {
	if _, err := osStat("/bin/echo"); err != nil {
		t.Skip("no /bin/echo on this platform")
	}
	r := &RealRunner{}
	stdout, _, code, err := r.Run(context.Background(), "/bin/echo", "hello")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if code != 0 || !strings.Contains(string(stdout), "hello") {
		t.Fatalf("unexpected output: stdout=%q code=%d", stdout, code)
	}
}

func TestRealRunner_HonoursContextCancellation(t *testing.T) {
	if _, err := osStat("/bin/sleep"); err != nil {
		t.Skip("no /bin/sleep on this platform")
	}
	r := &RealRunner{}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, _, _, err := r.Run(ctx, "/bin/sleep", "5")
	if err == nil {
		t.Fatal("expected cancellation error")
	}
	if time.Since(start) > 2*time.Second {
		t.Fatalf("cancellation took too long: %v", time.Since(start))
	}
}
