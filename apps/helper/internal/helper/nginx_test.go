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
