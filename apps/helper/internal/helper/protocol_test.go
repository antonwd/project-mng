package helper

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestReadFrame_RoundTrip(t *testing.T) {
	payload := []byte(`{"command":"nginx.reload"}`)
	var buf bytes.Buffer
	if err := WriteFrame(&buf, payload); err != nil {
		t.Fatalf("WriteFrame: %v", err)
	}
	got, err := ReadFrame(&buf)
	if err != nil {
		t.Fatalf("ReadFrame: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("payload mismatch: got %q want %q", got, payload)
	}
}

func TestReadFrame_RejectsOversizePayload(t *testing.T) {
	var buf bytes.Buffer
	// Lie about the size: claim payload is bigger than the limit.
	header := []byte{0xFF, 0xFF, 0xFF, 0xFF} // ~4 GiB
	buf.Write(header)
	_, err := ReadFrame(&buf)
	if err == nil || !strings.Contains(err.Error(), "payload too large") {
		t.Fatalf("expected payload-too-large error, got %v", err)
	}
}

func TestReadFrame_ShortHeader(t *testing.T) {
	buf := bytes.NewReader([]byte{0x00, 0x00}) // only 2 bytes
	_, err := ReadFrame(buf)
	if err == nil || !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("expected io.ErrUnexpectedEOF, got %v", err)
	}
}

func TestRequestJSON_Roundtrip(t *testing.T) {
	src := Request{
		Command: "nginx.write_config",
		Params:  json.RawMessage(`{"name":"myapp","content":"server {}"}`),
	}
	encoded, err := json.Marshal(src)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var dst Request
	if err := json.Unmarshal(encoded, &dst); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if dst.Command != src.Command {
		t.Fatalf("command mismatch: %q vs %q", dst.Command, src.Command)
	}
	if string(dst.Params) != string(src.Params) {
		t.Fatalf("params mismatch: %q vs %q", dst.Params, src.Params)
	}
}

func TestSuccessResponse_OmitsErrorFields(t *testing.T) {
	resp := SuccessResponse(map[string]any{"reloaded": true})
	encoded, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	s := string(encoded)
	if !strings.Contains(s, `"ok":true`) {
		t.Fatalf("missing ok:true: %s", s)
	}
	if strings.Contains(s, `"error"`) || strings.Contains(s, `"stderr"`) {
		t.Fatalf("unexpected error fields in success response: %s", s)
	}
}

func TestErrorResponse_TruncatesStderr(t *testing.T) {
	long := strings.Repeat("x", 10_000)
	resp := ErrorResponse("nginx_test_failed", "nginx -t exited non-zero", long)
	if len(resp.Stderr) > MaxStderrBytes {
		t.Fatalf("stderr not truncated: len=%d max=%d", len(resp.Stderr), MaxStderrBytes)
	}
	if !strings.HasSuffix(resp.Stderr, "…[truncated]") {
		t.Fatalf("expected truncation marker, got suffix %q", resp.Stderr[len(resp.Stderr)-20:])
	}
}
