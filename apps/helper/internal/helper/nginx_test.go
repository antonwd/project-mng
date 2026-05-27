package helper

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestNginxWriteConfig_Success(t *testing.T) {
	mw := NewMemoryWriter()
	h := &Handlers{
		Cfg:    Config{NginxConfigDir: "/etc/nginx/managed"},
		Writer: mw,
	}
	params := json.RawMessage(`{"name":"myapp","content":"server { listen 127.0.0.1:10000; }"}`)
	resp := h.NginxWriteConfig(context.Background(), params)
	if !resp.OK {
		t.Fatalf("expected ok, got %+v", resp)
	}
	want := "/etc/nginx/managed/myapp.conf"
	if got := mw.Files[want]; string(got) == "" {
		t.Fatalf("file not written at %s", want)
	}
	if mw.Modes[want] != 0o640 {
		t.Fatalf("expected mode 0640, got %o", mw.Modes[want])
	}
}

func TestNginxWriteConfig_RejectsInvalidName(t *testing.T) {
	mw := NewMemoryWriter()
	h := &Handlers{Cfg: Config{NginxConfigDir: "/etc/nginx/managed"}, Writer: mw}
	cases := []string{
		`{"name":"../etc/passwd","content":"x"}`,
		`{"name":"UPPER","content":"x"}`,
		`{"name":"","content":"x"}`,
		`{"name":"my app","content":"x"}`,
	}
	for _, p := range cases {
		resp := h.NginxWriteConfig(context.Background(), json.RawMessage(p))
		if resp.OK {
			t.Errorf("expected failure for %s, got ok", p)
		}
		if resp.Error != "validation_failed" {
			t.Errorf("expected validation_failed, got %q for %s", resp.Error, p)
		}
	}
	if len(mw.Files) != 0 {
		t.Fatalf("expected no files written, got %d", len(mw.Files))
	}
}

func TestNginxWriteConfig_RejectsMalformedJSON(t *testing.T) {
	h := &Handlers{Cfg: Config{NginxConfigDir: "/etc/nginx/managed"}, Writer: NewMemoryWriter()}
	resp := h.NginxWriteConfig(context.Background(), json.RawMessage(`not json`))
	if resp.OK || resp.Error != "bad_request" {
		t.Fatalf("expected bad_request, got %+v", resp)
	}
}

func TestNginxWriteConfig_EmptyContentIsAllowed(t *testing.T) {
	// An empty managed config file is valid (e.g. during teardown).
	mw := NewMemoryWriter()
	h := &Handlers{Cfg: Config{NginxConfigDir: "/etc/nginx/managed"}, Writer: mw}
	resp := h.NginxWriteConfig(context.Background(), json.RawMessage(`{"name":"x","content":""}`))
	if !resp.OK {
		t.Fatalf("expected ok, got %+v", resp)
	}
	if got, ok := mw.Files["/etc/nginx/managed/x.conf"]; !ok || len(got) != 0 {
		t.Fatalf("expected empty file written, got ok=%v len=%d", ok, len(got))
	}
}

func TestNginxWriteConfig_DataIncludesPath(t *testing.T) {
	mw := NewMemoryWriter()
	h := &Handlers{Cfg: Config{NginxConfigDir: "/etc/nginx/managed"}, Writer: mw}
	resp := h.NginxWriteConfig(context.Background(), json.RawMessage(`{"name":"a","content":"x"}`))
	if !resp.OK {
		t.Fatalf("expected ok: %+v", resp)
	}
	data, _ := json.Marshal(resp.Data)
	if !strings.Contains(string(data), `"path":"/etc/nginx/managed/a.conf"`) {
		t.Fatalf("data missing path: %s", data)
	}
}

func TestNginxReload_HappyPath(t *testing.T) {
	runner := &FakeRunner{
		Responses: []FakeResponse{
			{ExitCode: 0}, // nginx -t
			{ExitCode: 0}, // systemctl reload nginx
		},
	}
	h := &Handlers{
		Cfg:    Config{NginxBin: "/usr/sbin/nginx", SystemctlBin: "/bin/systemctl"},
		Runner: runner,
	}
	resp := h.NginxReload(context.Background())
	if !resp.OK {
		t.Fatalf("expected ok, got %+v", resp)
	}
	if len(runner.Calls) != 2 {
		t.Fatalf("expected 2 calls, got %d", len(runner.Calls))
	}
	if runner.Calls[0].Name != "/usr/sbin/nginx" || runner.Calls[0].Args[0] != "-t" {
		t.Fatalf("unexpected first call: %+v", runner.Calls[0])
	}
	if runner.Calls[1].Name != "/bin/systemctl" ||
		runner.Calls[1].Args[0] != "reload" ||
		runner.Calls[1].Args[1] != "nginx" {
		t.Fatalf("unexpected second call: %+v", runner.Calls[1])
	}
}

func TestNginxReload_TestFails(t *testing.T) {
	runner := &FakeRunner{
		Responses: []FakeResponse{
			{ExitCode: 1, Stderr: []byte("nginx: [emerg] bind() to 0.0.0.0:80 failed")},
		},
	}
	h := &Handlers{
		Cfg:    Config{NginxBin: "/usr/sbin/nginx", SystemctlBin: "/bin/systemctl"},
		Runner: runner,
	}
	resp := h.NginxReload(context.Background())
	if resp.OK || resp.Error != "nginx_test_failed" {
		t.Fatalf("expected nginx_test_failed, got %+v", resp)
	}
	if len(runner.Calls) != 1 {
		t.Fatalf("expected reload NOT to be attempted, got %d calls", len(runner.Calls))
	}
}

func TestNginxReload_ReloadFails(t *testing.T) {
	runner := &FakeRunner{
		Responses: []FakeResponse{
			{ExitCode: 0},
			{ExitCode: 1, Stderr: []byte("Failed to reload nginx.service")},
		},
	}
	h := &Handlers{
		Cfg:    Config{NginxBin: "/usr/sbin/nginx", SystemctlBin: "/bin/systemctl"},
		Runner: runner,
	}
	resp := h.NginxReload(context.Background())
	if resp.OK || resp.Error != "nginx_reload_failed" {
		t.Fatalf("expected nginx_reload_failed, got %+v", resp)
	}
}
