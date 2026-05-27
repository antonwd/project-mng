# Host Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `projectmng-helper`, a small Go binary that runs as root via systemd and exposes a Unix-socket JSON-RPC API with exactly four allow-listed commands (`nginx.write_config`, `nginx.reload`, `certbot.issue`, `certbot.renew`) — the only root surface the rest of the platform will trust.

**Architecture:** Single static Go binary, stdlib-only (no third-party deps). Listens on `/run/projectmng/helper.sock` (mode 0660, group `projectmng`). Length-prefixed JSON framing, one request per connection. All shell-outs use absolute binary paths with no `$PATH` lookup. All inputs strictly validated before reaching exec. Filesystem writes are atomic (temp + rename). Comprehensive unit tests via fake `CommandRunner` and `AtomicWriter` interfaces; integration tests against a containerized nginx run via build tags.

**Tech Stack:** Go 1.22, stdlib only, systemd unit + tmpfiles.d snippet, GNU Make.

**Repo layout established by Task 1** (root of the project monorepo):

```
projectMng/                        (already exists, git-initialized)
├── docs/superpowers/...           (already exists)
└── apps/
    └── helper/                    (this plan creates everything here)
        ├── .gitignore
        ├── Makefile
        ├── README.md
        ├── go.mod
        ├── cmd/
        │   ├── projectmng-helper/main.go        (Task 11)
        │   └── projectmng-helper-cli/main.go    (Task 13)
        ├── internal/helper/
        │   ├── protocol.go            (Task 2) — wire types + framing
        │   ├── protocol_test.go       (Task 2)
        │   ├── validate.go            (Task 3) — name/domain/email validators
        │   ├── validate_test.go       (Task 3)
        │   ├── exec.go                (Task 4) — CommandRunner interface + real impl
        │   ├── exec_test.go           (Task 4)
        │   ├── writer.go              (Task 5) — AtomicWriter interface + real impl
        │   ├── writer_test.go         (Task 5)
        │   ├── nginx.go               (Tasks 6, 7) — write_config + reload handlers
        │   ├── nginx_test.go          (Tasks 6, 7)
        │   ├── certbot.go             (Tasks 8, 9) — issue + renew handlers
        │   ├── certbot_test.go        (Tasks 8, 9)
        │   ├── server.go              (Task 10) — accept loop + dispatch
        │   └── server_test.go         (Task 10)
        ├── systemd/
        │   ├── projectmng-helper.service
        │   └── projectmng-helper.tmpfiles
        └── testdata/
            └── nginx-snippets/managed-site.conf
```

**Module path used throughout:** `github.com/projectmng/projectmng/apps/helper`. The user can rename later by editing `go.mod` and running `go mod tidy` if they pick a different GitHub owner namespace; no code depends on the literal owner name.

**Conventions used throughout this plan:**
- Every command's working directory is given explicitly (`from apps/helper/, run: ...`). Assume the engineer starts at the repo root.
- Test files are TDD-first: write the failing test, run it to confirm failure, then write minimal code to pass.
- Commits use Conventional Commits with the `helper:` scope, ending with the project's standard co-author trailer.
- Stdlib only. If a task is tempted to add a dependency, stop and reread — there is no task in this plan that requires one.

---

## Task 1: Project bootstrap

**Files:**
- Create: `apps/helper/.gitignore`
- Create: `apps/helper/go.mod`
- Create: `apps/helper/Makefile`
- Create: `apps/helper/README.md`

- [ ] **Step 1: Create the helper subtree and init the Go module**

From the repo root (`/Users/Anton/Desktop/Projects/projectMng`), run:

```bash
mkdir -p apps/helper/cmd/projectmng-helper apps/helper/cmd/projectmng-helper-cli \
         apps/helper/internal/helper \
         apps/helper/systemd \
         apps/helper/testdata/nginx-snippets
cd apps/helper && go mod init github.com/projectmng/projectmng/apps/helper
```

Expected: `apps/helper/go.mod` is created with a single `module` line and a `go 1.22` directive. If the installed Go is newer (e.g. 1.23), that's fine — `go mod init` will write the installed minor.

- [ ] **Step 2: Create `apps/helper/.gitignore`**

Contents:

```
# Build artifacts
/bin/
/dist/
projectmng-helper
projectmng-helper-cli

# Test artifacts
*.test
*.out
coverage.txt

# Editor
.idea/
.vscode/
*.swp
```

- [ ] **Step 3: Create `apps/helper/Makefile`**

Contents (tabs are required for recipe lines — make sure your editor uses actual tabs):

```makefile
BIN_DIR        ?= bin
HELPER_BIN     ?= $(BIN_DIR)/projectmng-helper
CLI_BIN        ?= $(BIN_DIR)/projectmng-helper-cli
GOFLAGS        ?= -trimpath
LDFLAGS        ?= -s -w

.PHONY: all build test test-integration tidy fmt vet lint clean install

all: build

build:
	mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 go build $(GOFLAGS) -ldflags '$(LDFLAGS)' -o $(HELPER_BIN) ./cmd/projectmng-helper
	CGO_ENABLED=0 go build $(GOFLAGS) -ldflags '$(LDFLAGS)' -o $(CLI_BIN) ./cmd/projectmng-helper-cli

test:
	go test ./...

test-integration:
	go test -tags=integration ./...

tidy:
	go mod tidy

fmt:
	gofmt -w -s .

vet:
	go vet ./...

lint: fmt vet

clean:
	rm -rf $(BIN_DIR) dist

install: build
	install -D -m 0755 $(HELPER_BIN) $(DESTDIR)/usr/local/bin/projectmng-helper
	install -D -m 0644 systemd/projectmng-helper.service $(DESTDIR)/etc/systemd/system/projectmng-helper.service
	install -D -m 0644 systemd/projectmng-helper.tmpfiles $(DESTDIR)/usr/lib/tmpfiles.d/projectmng-helper.conf
```

- [ ] **Step 4: Create `apps/helper/README.md`**

Contents:

```markdown
# projectmng-helper

The privileged root surface for the projectMng platform. A small Go binary that
runs as root via systemd and accepts exactly four commands over a Unix socket:

- `nginx.write_config` — atomically write a managed site config
- `nginx.reload`       — `nginx -t && systemctl reload nginx`
- `certbot.issue`      — issue a Let's Encrypt cert via webroot
- `certbot.renew`      — renew all managed certs and reload nginx

Anything else returns an error. Inputs are strictly validated before reaching
`exec`. All shelled-out commands use absolute paths; `$PATH` is never consulted.

## Building

    make build

## Testing

    make test                  # unit tests (run anywhere)
    make test-integration      # integration tests (Linux + Docker required)

## Installing on a host

    sudo make install
    sudo systemctl daemon-reload
    sudo systemctl enable --now projectmng-helper

Requires a `projectmng` system user/group, an empty
`/etc/nginx/sites-enabled/managed/` directory writable by group `projectmng`,
and `/var/www/_acme/` for the certbot webroot.
```

- [ ] **Step 5: Verify the empty project builds**

From `apps/helper/`, run:

```bash
go build ./...
```

Expected: completes silently with exit 0. (There are no packages yet, but `go build ./...` on an empty module is a no-op.)

- [ ] **Step 6: Commit**

From the repo root, run:

```bash
git add apps/helper/.gitignore apps/helper/go.mod apps/helper/Makefile apps/helper/README.md
git commit -m "$(cat <<'EOF'
helper: bootstrap Go module, Makefile, and README

Module path: github.com/projectmng/projectmng/apps/helper.
Stdlib-only by design — no dependencies added or planned.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire protocol (request/response + length-prefixed framing)

**Files:**
- Create: `apps/helper/internal/helper/protocol.go`
- Create: `apps/helper/internal/helper/protocol_test.go`

**Protocol design:**
- One request per TCP/Unix connection. Server closes after responding.
- Framing: 4-byte big-endian uint32 payload length, followed by `payload` bytes of JSON.
- Max payload size: **1 MiB** (covers any reasonable nginx site config plus headroom).
- Request: `{"command": "<name>", "params": {...}}` where `params` shape depends on `command`.
- Response: `{"ok": true, "data": {...}}` or `{"ok": false, "error": "<short code>", "message": "<human>", "stderr": "<truncated>"}`.

- [ ] **Step 1: Write the failing tests**

Create `apps/helper/internal/helper/protocol_test.go`:

```go
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
	if !errors.Is(err, io.ErrUnexpectedEOF) && err == nil {
		t.Fatalf("expected EOF-ish error, got %v", err)
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build error along the lines of `undefined: WriteFrame`, `undefined: ReadFrame`, `undefined: Request`, etc. This is the failing state we want.

- [ ] **Step 3: Implement the protocol**

Create `apps/helper/internal/helper/protocol.go`:

```go
// Package helper implements the projectmng-helper Unix-socket protocol
// and command handlers. It is intentionally dependency-free (stdlib only).
package helper

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

// MaxPayloadBytes is the largest single request/response payload allowed.
// 1 MiB is comfortably larger than any reasonable nginx site config.
const MaxPayloadBytes = 1 << 20

// MaxStderrBytes caps the stderr captured in error responses so a runaway
// child process can't blow up the wire payload.
const MaxStderrBytes = 4 * 1024

// Request is the wire format for one inbound RPC.
type Request struct {
	Command string          `json:"command"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is the wire format for one outbound RPC reply.
type Response struct {
	OK      bool   `json:"ok"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`   // short code, e.g. "validation_failed"
	Message string `json:"message,omitempty"` // human-readable detail
	Stderr  string `json:"stderr,omitempty"`  // truncated stderr from a child process
}

// SuccessResponse builds an ok response with optional data.
func SuccessResponse(data any) Response {
	return Response{OK: true, Data: data}
}

// ErrorResponse builds a failure response, truncating stderr if needed.
func ErrorResponse(code, message, stderr string) Response {
	if len(stderr) > MaxStderrBytes {
		const marker = "…[truncated]"
		keep := MaxStderrBytes - len(marker)
		if keep < 0 {
			keep = 0
		}
		stderr = stderr[:keep] + marker
	}
	return Response{OK: false, Error: code, Message: message, Stderr: stderr}
}

// WriteFrame writes a length-prefixed payload to w.
func WriteFrame(w io.Writer, payload []byte) error {
	if len(payload) > MaxPayloadBytes {
		return fmt.Errorf("payload too large: %d > %d", len(payload), MaxPayloadBytes)
	}
	var hdr [4]byte
	binary.BigEndian.PutUint32(hdr[:], uint32(len(payload)))
	if _, err := w.Write(hdr[:]); err != nil {
		return err
	}
	if _, err := w.Write(payload); err != nil {
		return err
	}
	return nil
}

// ReadFrame reads a length-prefixed payload from r. Returns an error if the
// declared length exceeds MaxPayloadBytes.
func ReadFrame(r io.Reader) ([]byte, error) {
	var hdr [4]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return nil, err
	}
	length := binary.BigEndian.Uint32(hdr[:])
	if length > MaxPayloadBytes {
		return nil, fmt.Errorf("payload too large: %d > %d", length, MaxPayloadBytes)
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: `ok  github.com/projectmng/projectmng/apps/helper/internal/helper`.

- [ ] **Step 5: Commit**

From the repo root, run:

```bash
git add apps/helper/internal/helper/protocol.go apps/helper/internal/helper/protocol_test.go
git commit -m "$(cat <<'EOF'
helper: add wire protocol (length-prefixed JSON frames)

1 MiB payload cap, 4 KiB stderr cap, single request per connection.
Stdlib only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Input validation (config name, domain, email)

**Files:**
- Create: `apps/helper/internal/helper/validate.go`
- Create: `apps/helper/internal/helper/validate_test.go`

**Rules to enforce:**
- **Config name** (used as the filename in `/etc/nginx/sites-enabled/managed/<name>.conf`): `^[a-z0-9][a-z0-9-]{0,62}$`. Lowercase, starts alphanumeric, length 1–63. Rejects path separators, dots, spaces, unicode.
- **Domain** (used in certbot `-d <domain>`): RFC 1123 hostname, ASCII only, lowercase, total length ≤253, each label 1–63 chars, no leading/trailing hyphens. Rejects wildcards (we don't support DNS-01).
- **Email** (used in certbot `--email <email>`): one `@`, simple local part + simple domain part both non-empty, total length ≤254. Loose by intent — certbot will reject malformed addresses anyway, our job is to refuse obvious injection.
- **Nginx config content**: only check size (≤MaxPayloadBytes after JSON decode). Content semantics are validated by `nginx -t` after the write, not by us.

- [ ] **Step 1: Write the failing tests**

Create `apps/helper/internal/helper/validate_test.go`:

```go
package helper

import (
	"strings"
	"testing"
)

func TestValidateConfigName(t *testing.T) {
	cases := []struct {
		name    string
		wantErr bool
	}{
		{"myapp", false},
		{"my-app", false},
		{"a", false},
		{"123abc", false},
		{strings.Repeat("a", 63), false},
		{"", true},
		{strings.Repeat("a", 64), true},
		{"-leading-dash", true},
		{"UPPERCASE", true},
		{"with.dot", true},
		{"with/slash", true},
		{"with space", true},
		{"with_underscore", true},
		{"unícode", true},
		{"..", true},
	}
	for _, tc := range cases {
		err := ValidateConfigName(tc.name)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateConfigName(%q): wantErr=%v, gotErr=%v", tc.name, tc.wantErr, err)
		}
	}
}

func TestValidateDomain(t *testing.T) {
	cases := []struct {
		domain  string
		wantErr bool
	}{
		{"example.com", false},
		{"sub.example.com", false},
		{"a.b.c.d.example.com", false},
		{"xn--bcher-kva.example", false}, // punycode IDN
		{"123.example.com", false},
		{"", true},
		{"EXAMPLE.COM", true},               // uppercase
		{"-leading.example.com", true},      // leading dash
		{"trailing-.example.com", true},     // trailing dash
		{"*.example.com", true},             // wildcard
		{"exa mple.com", true},              // space
		{"example", true},                   // no dot (single label)
		{strings.Repeat("a", 64) + ".com", true}, // label too long
		{strings.Repeat("a.", 130) + "com", true}, // total too long
		{"example..com", true},              // empty label
	}
	for _, tc := range cases {
		err := ValidateDomain(tc.domain)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateDomain(%q): wantErr=%v, gotErr=%v", tc.domain, tc.wantErr, err)
		}
	}
}

func TestValidateEmail(t *testing.T) {
	cases := []struct {
		email   string
		wantErr bool
	}{
		{"you@example.com", false},
		{"a+b@example.co.uk", false},
		{"a.b.c@x.y", false},
		{"", true},
		{"noatsign", true},
		{"@example.com", true},
		{"you@", true},
		{"a@b@c", true},
		{"you example.com", true},
		{strings.Repeat("a", 250) + "@x.y", true},
	}
	for _, tc := range cases {
		err := ValidateEmail(tc.email)
		if (err != nil) != tc.wantErr {
			t.Errorf("ValidateEmail(%q): wantErr=%v, gotErr=%v", tc.email, tc.wantErr, err)
		}
	}
}
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build error `undefined: ValidateConfigName`, etc.

- [ ] **Step 3: Implement the validators**

Create `apps/helper/internal/helper/validate.go`:

```go
package helper

import (
	"errors"
	"fmt"
	"strings"
)

const (
	maxDomainLen = 253
	maxLabelLen  = 63
	maxEmailLen  = 254
	maxNameLen   = 63
)

// ValidateConfigName enforces the filename rule for managed nginx site configs:
// ^[a-z0-9][a-z0-9-]{0,62}$. This is deliberately stricter than a general
// filename validator — it prevents any form of path traversal or shell oddity.
func ValidateConfigName(name string) error {
	if name == "" {
		return errors.New("config name is empty")
	}
	if len(name) > maxNameLen {
		return fmt.Errorf("config name length %d exceeds max %d", len(name), maxNameLen)
	}
	for i, r := range name {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= '0' && r <= '9':
		case r == '-' && i != 0:
		default:
			return fmt.Errorf("config name contains invalid character %q at index %d", r, i)
		}
	}
	return nil
}

// ValidateDomain accepts an RFC 1123 hostname suitable for certbot -d.
// Wildcards are rejected (we only do HTTP-01 webroot challenges).
func ValidateDomain(domain string) error {
	if domain == "" {
		return errors.New("domain is empty")
	}
	if len(domain) > maxDomainLen {
		return fmt.Errorf("domain length %d exceeds max %d", len(domain), maxDomainLen)
	}
	if strings.Contains(domain, "*") {
		return errors.New("wildcard domains are not supported")
	}
	if !strings.Contains(domain, ".") {
		return errors.New("domain must contain at least one dot")
	}
	for i, r := range domain {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= '0' && r <= '9':
		case r == '.' || r == '-':
		default:
			return fmt.Errorf("domain contains invalid character %q at index %d", r, i)
		}
	}
	for _, label := range strings.Split(domain, ".") {
		if label == "" {
			return errors.New("domain has empty label")
		}
		if len(label) > maxLabelLen {
			return fmt.Errorf("domain label %q exceeds max length %d", label, maxLabelLen)
		}
		if label[0] == '-' || label[len(label)-1] == '-' {
			return fmt.Errorf("domain label %q has leading or trailing hyphen", label)
		}
	}
	return nil
}

// ValidateEmail is a deliberately loose check: it refuses obvious injection
// and lets certbot do the real RFC 5321/5322 validation.
func ValidateEmail(email string) error {
	if email == "" {
		return errors.New("email is empty")
	}
	if len(email) > maxEmailLen {
		return fmt.Errorf("email length %d exceeds max %d", len(email), maxEmailLen)
	}
	at := strings.Index(email, "@")
	if at <= 0 || at != strings.LastIndex(email, "@") {
		return errors.New("email must contain exactly one @ with non-empty local part")
	}
	local, domain := email[:at], email[at+1:]
	if local == "" || domain == "" {
		return errors.New("email has empty local or domain part")
	}
	if strings.ContainsAny(email, " \t\r\n") {
		return errors.New("email contains whitespace")
	}
	if !strings.Contains(domain, ".") {
		return errors.New("email domain must contain a dot")
	}
	return nil
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: `ok  github.com/projectmng/projectmng/apps/helper/internal/helper`.

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/validate.go apps/helper/internal/helper/validate_test.go
git commit -m "$(cat <<'EOF'
helper: add strict validators for config name, domain, email

Refuses path traversal, wildcards, whitespace, and uppercase. Email is
deliberately loose — certbot does the strict check.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: CommandRunner abstraction (real + fake)

**Files:**
- Create: `apps/helper/internal/helper/exec.go`
- Create: `apps/helper/internal/helper/exec_test.go`

**Why an interface:** every shell-out in this binary must (1) use an absolute path, never `$PATH`, (2) be cancellable via context, (3) capture stdout+stderr separately, (4) report exit code. Wrapping `os/exec` behind a small interface lets every handler take a `CommandRunner` and lets tests inject a `FakeRunner` that records calls and returns scripted output.

- [ ] **Step 1: Write the failing tests**

Create `apps/helper/internal/helper/exec_test.go`:

```go
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
```

Note: the tests reference `osStat` (a tiny indirection so filesystem checks can be mocked later if needed; for now it's just `os.Stat`). It will be defined alongside the runners in Step 3. Do not create `exec.go` yet — Step 2 should fail at compile time because all of these symbols are missing.

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build errors `undefined: FakeRunner`, `undefined: RealRunner`, `undefined: osStat`, etc.

- [ ] **Step 3: Implement `exec.go`**

Create `apps/helper/internal/helper/exec.go`:

```go
package helper

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// CommandRunner is the abstraction every handler shells out through. The
// production implementation is RealRunner; tests use FakeRunner.
type CommandRunner interface {
	Run(ctx context.Context, name string, args ...string) (stdout, stderr []byte, exitCode int, err error)
}

// RealRunner wraps os/exec. It refuses any name that isn't an absolute path —
// this is the policy that prevents $PATH-based hijacking by an attacker who
// can influence env vars but not files on disk.
type RealRunner struct{}

func (r *RealRunner) Run(ctx context.Context, name string, args ...string) ([]byte, []byte, int, error) {
	if !filepath.IsAbs(name) {
		return nil, nil, -1, fmt.Errorf("command name must be absolute, got %q", name)
	}
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = []string{} // no env leaks to children
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	code := -1
	if cmd.ProcessState != nil {
		code = cmd.ProcessState.ExitCode()
	}
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			// Non-zero exit isn't an "err" we surface; return code != 0 instead.
			return stdout.Bytes(), stderr.Bytes(), code, nil
		}
		return stdout.Bytes(), stderr.Bytes(), code, err
	}
	return stdout.Bytes(), stderr.Bytes(), code, nil
}

// FakeRunner records every call and returns scripted responses, in order.
type FakeRunner struct {
	Responses []FakeResponse
	Calls     []FakeCall
	next      int
}

// FakeResponse is one scripted reply from a FakeRunner.
type FakeResponse struct {
	Stdout   []byte
	Stderr   []byte
	ExitCode int
	Err      error
}

// FakeCall records a single invocation for later inspection.
type FakeCall struct {
	Name string
	Args []string
}

func (f *FakeRunner) Run(_ context.Context, name string, args ...string) ([]byte, []byte, int, error) {
	f.Calls = append(f.Calls, FakeCall{Name: name, Args: append([]string(nil), args...)})
	if f.next >= len(f.Responses) {
		return nil, nil, -1, fmt.Errorf("FakeRunner: no scripted response for call %d (%s)", f.next, name)
	}
	resp := f.Responses[f.next]
	f.next++
	return resp.Stdout, resp.Stderr, resp.ExitCode, resp.Err
}

// osStat is an indirection so tests can (later) override filesystem checks.
// For now it is just os.Stat.
var osStat = func(p string) (os.FileInfo, error) { return os.Stat(p) }
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: all tests pass. The two `TestRealRunner_*` tests may print `--- SKIP` on systems without `/bin/echo` or `/bin/sleep`; that's acceptable.

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/exec.go apps/helper/internal/helper/exec_test.go
git commit -m "$(cat <<'EOF'
helper: add CommandRunner interface with RealRunner and FakeRunner

RealRunner refuses relative paths and runs with an empty env so $PATH-style
hijacking is impossible. FakeRunner is a record-and-reply double for tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: AtomicWriter abstraction (real + fake)

**Files:**
- Create: `apps/helper/internal/helper/writer.go`
- Create: `apps/helper/internal/helper/writer_test.go`

**Why an interface:** nginx config writes must be atomic — a partial write that fails mid-flight could leave nginx with a half-written config and a failed reload. The real impl writes to a temp file in the same directory, then renames it over the target (POSIX `rename(2)` is atomic on the same filesystem). Tests use an in-memory map so we can run them anywhere without touching the real filesystem.

- [ ] **Step 1: Write the failing tests**

Create `apps/helper/internal/helper/writer_test.go`:

```go
package helper

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestMemoryWriter_RecordsWrites(t *testing.T) {
	mw := NewMemoryWriter()
	if err := mw.WriteAtomic("/etc/nginx/managed/a.conf", []byte("server {}"), 0o644); err != nil {
		t.Fatalf("WriteAtomic: %v", err)
	}
	got, ok := mw.Files["/etc/nginx/managed/a.conf"]
	if !ok || string(got) != "server {}" {
		t.Fatalf("missing or wrong content: ok=%v got=%q", ok, got)
	}
}

func TestRealWriter_WritesAndRenamesAtomically(t *testing.T) {
	dir := t.TempDir()
	rw := &RealWriter{}
	target := filepath.Join(dir, "out.conf")
	if err := rw.WriteAtomic(target, []byte("hello"), 0o640); err != nil {
		t.Fatalf("WriteAtomic: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != "hello" {
		t.Fatalf("content mismatch: %q", got)
	}
	st, err := os.Stat(target)
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if st.Mode().Perm() != 0o640 {
		t.Fatalf("mode mismatch: got %o want 0640", st.Mode().Perm())
	}
	// Temp file should not be left behind.
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected 1 file, got %d", len(entries))
	}
}

func TestRealWriter_RefusesRelativePath(t *testing.T) {
	rw := &RealWriter{}
	err := rw.WriteAtomic("relative.conf", []byte("x"), 0o644)
	if err == nil || !errors.Is(err, errPathNotAbsolute) {
		t.Fatalf("expected errPathNotAbsolute, got %v", err)
	}
}
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build errors `undefined: MemoryWriter`, `undefined: RealWriter`, `undefined: errPathNotAbsolute`.

- [ ] **Step 3: Implement `writer.go`**

Create `apps/helper/internal/helper/writer.go`:

```go
package helper

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// AtomicWriter writes a file in a way that's either fully visible or not at
// all — readers never see a half-written file.
type AtomicWriter interface {
	WriteAtomic(path string, content []byte, mode os.FileMode) error
}

var errPathNotAbsolute = errors.New("path must be absolute")

// RealWriter writes to the real filesystem using temp-file + rename.
type RealWriter struct{}

func (RealWriter) WriteAtomic(path string, content []byte, mode os.FileMode) error {
	if !filepath.IsAbs(path) {
		return errPathNotAbsolute
	}
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	tmp, err := os.CreateTemp(dir, "."+base+".tmp.*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpName := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpName) }
	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("write temp: %w", err)
	}
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("chmod temp: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("fsync temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return fmt.Errorf("close temp: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		cleanup()
		return fmt.Errorf("rename: %w", err)
	}
	return nil
}

// MemoryWriter records writes in a map for tests.
type MemoryWriter struct {
	Files map[string][]byte
	Modes map[string]os.FileMode
}

// NewMemoryWriter returns an initialized MemoryWriter.
func NewMemoryWriter() *MemoryWriter {
	return &MemoryWriter{
		Files: map[string][]byte{},
		Modes: map[string]os.FileMode{},
	}
}

func (m *MemoryWriter) WriteAtomic(path string, content []byte, mode os.FileMode) error {
	cp := make([]byte, len(content))
	copy(cp, content)
	m.Files[path] = cp
	m.Modes[path] = mode
	return nil
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/writer.go apps/helper/internal/helper/writer_test.go
git commit -m "$(cat <<'EOF'
helper: add AtomicWriter with temp+rename real impl and in-memory fake

Atomic writes ensure nginx never sees a half-written managed config.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Nginx `write_config` handler

**Files:**
- Create: `apps/helper/internal/helper/nginx.go`
- Create: `apps/helper/internal/helper/nginx_test.go`

**Behaviour:**
- Decode params `{"name": "...", "content": "..."}`.
- Validate `name` via `ValidateConfigName`.
- Compose target path: `<ConfigDir>/<name>.conf` where `ConfigDir` is configurable via the `Config` struct (defaults to `/etc/nginx/sites-enabled/managed`).
- Write atomically with mode `0640`.
- Return `{"path": "<full path>", "bytes": <len>}` on success.
- Do **not** reload nginx here — that is a separate command (callers always pair write + reload but we keep the privilege of each operation distinct in case validation needs to happen between them).

- [ ] **Step 1: Write the failing tests**

Create `apps/helper/internal/helper/nginx_test.go`:

```go
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build errors `undefined: Handlers`, `undefined: Config`, etc.

- [ ] **Step 3: Implement `nginx.go` (write_config only — reload comes in Task 7)**

Create `apps/helper/internal/helper/nginx.go`:

```go
package helper

import (
	"context"
	"encoding/json"
	"path/filepath"
)

// Config holds tunables resolved from env vars / install-time defaults.
type Config struct {
	NginxBin       string // e.g. /usr/sbin/nginx
	SystemctlBin   string // e.g. /bin/systemctl
	CertbotBin     string // e.g. /usr/bin/certbot
	NginxConfigDir string // e.g. /etc/nginx/sites-enabled/managed
	AcmeWebroot    string // e.g. /var/www/_acme
}

// Handlers groups the command handlers around their dependencies.
type Handlers struct {
	Cfg    Config
	Runner CommandRunner
	Writer AtomicWriter
}

type nginxWriteConfigParams struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// NginxWriteConfig writes a managed nginx site config atomically.
func (h *Handlers) NginxWriteConfig(_ context.Context, raw json.RawMessage) Response {
	var p nginxWriteConfigParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return ErrorResponse("bad_request", "params not valid JSON", err.Error())
	}
	if err := ValidateConfigName(p.Name); err != nil {
		return ErrorResponse("validation_failed", err.Error(), "")
	}
	path := filepath.Join(h.Cfg.NginxConfigDir, p.Name+".conf")
	if err := h.Writer.WriteAtomic(path, []byte(p.Content), 0o640); err != nil {
		return ErrorResponse("write_failed", "failed to write managed config", err.Error())
	}
	return SuccessResponse(map[string]any{
		"path":  path,
		"bytes": len(p.Content),
	})
}

// (NginxReload comes in Task 7.)
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/nginx.go apps/helper/internal/helper/nginx_test.go
git commit -m "$(cat <<'EOF'
helper: add nginx.write_config handler (atomic write, name validation)

Writes /etc/nginx/sites-enabled/managed/<name>.conf with mode 0640. Does
not reload nginx — that is a separate command.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Nginx `reload` handler

**Files:**
- Modify: `apps/helper/internal/helper/nginx.go`
- Modify: `apps/helper/internal/helper/nginx_test.go`

**Behaviour:**
- No params.
- Step A: run `<NginxBin> -t` (10s timeout). If exit ≠ 0, return `nginx_test_failed` with stderr.
- Step B: run `<SystemctlBin> reload nginx` (10s timeout). If exit ≠ 0, return `nginx_reload_failed` with stderr.
- Return `{"validated": true, "reloaded": true}` on success.

- [ ] **Step 1: Add the failing tests**

Append to `apps/helper/internal/helper/nginx_test.go`:

```go
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build error `undefined: NginxReload`.

- [ ] **Step 3: Implement `NginxReload`**

Append the new handler to `apps/helper/internal/helper/nginx.go`, after the existing `NginxWriteConfig`. Replace the `// (NginxReload comes in Task 7.)` comment with:

```go
// NginxReload validates the running nginx configuration and reloads it via
// systemd. Validate-before-reload prevents nginx from being asked to apply
// a broken config that would crash the master process.
func (h *Handlers) NginxReload(ctx context.Context) Response {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_, stderr, code, err := h.Runner.Run(ctx, h.Cfg.NginxBin, "-t")
	if err != nil {
		return ErrorResponse("nginx_test_failed", "could not exec nginx -t: "+err.Error(), string(stderr))
	}
	if code != 0 {
		return ErrorResponse("nginx_test_failed", fmt.Sprintf("nginx -t exited %d", code), string(stderr))
	}
	_, stderr, code, err = h.Runner.Run(ctx, h.Cfg.SystemctlBin, "reload", "nginx")
	if err != nil {
		return ErrorResponse("nginx_reload_failed", "could not exec systemctl reload: "+err.Error(), string(stderr))
	}
	if code != 0 {
		return ErrorResponse("nginx_reload_failed", fmt.Sprintf("systemctl reload nginx exited %d", code), string(stderr))
	}
	return SuccessResponse(map[string]any{"validated": true, "reloaded": true})
}
```

And update the imports at the top of `nginx.go` to add `fmt` and `time`. The full top of the file should now be:

```go
package helper

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"time"
)
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/nginx.go apps/helper/internal/helper/nginx_test.go
git commit -m "$(cat <<'EOF'
helper: add nginx.reload handler (validate-then-reload, 10s timeout each)

Refuses to reload if nginx -t fails, so a broken managed config can never
crash the nginx master.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Certbot `issue` handler

**Files:**
- Create: `apps/helper/internal/helper/certbot.go`
- Create: `apps/helper/internal/helper/certbot_test.go`

**Behaviour:**
- Decode params `{"domain": "...", "email": "..."}`.
- Validate both via `ValidateDomain` / `ValidateEmail`.
- Run: `<CertbotBin> certonly --webroot -w <AcmeWebroot> -d <domain> -n --agree-tos --email <email>` with a 120-second timeout (certbot does network I/O).
- On exit 0: return `{"domain": "...", "issued": true}`. On non-zero: return `certbot_issue_failed` with stderr.

- [ ] **Step 1: Write the failing tests**

Create `apps/helper/internal/helper/certbot_test.go`:

```go
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build error `undefined: CertbotIssue`.

- [ ] **Step 3: Implement `certbot.go`**

Create `apps/helper/internal/helper/certbot.go`:

```go
package helper

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

const certbotTimeout = 120 * time.Second

type certbotIssueParams struct {
	Domain string `json:"domain"`
	Email  string `json:"email"`
}

// CertbotIssue requests a single-domain cert via HTTP-01 webroot.
func (h *Handlers) CertbotIssue(ctx context.Context, raw json.RawMessage) Response {
	var p certbotIssueParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return ErrorResponse("bad_request", "params not valid JSON", err.Error())
	}
	if err := ValidateDomain(p.Domain); err != nil {
		return ErrorResponse("validation_failed", err.Error(), "")
	}
	if err := ValidateEmail(p.Email); err != nil {
		return ErrorResponse("validation_failed", err.Error(), "")
	}
	ctx, cancel := context.WithTimeout(ctx, certbotTimeout)
	defer cancel()
	args := []string{
		"certonly", "--webroot",
		"-w", h.Cfg.AcmeWebroot,
		"-d", p.Domain,
		"-n", "--agree-tos",
		"--email", p.Email,
	}
	_, stderr, code, err := h.Runner.Run(ctx, h.Cfg.CertbotBin, args...)
	if err != nil {
		return ErrorResponse("certbot_issue_failed", "could not exec certbot: "+err.Error(), string(stderr))
	}
	if code != 0 {
		return ErrorResponse("certbot_issue_failed", fmt.Sprintf("certbot exited %d", code), string(stderr))
	}
	return SuccessResponse(map[string]any{"domain": p.Domain, "issued": true})
}

// (CertbotRenew comes in Task 9.)
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/certbot.go apps/helper/internal/helper/certbot_test.go
git commit -m "$(cat <<'EOF'
helper: add certbot.issue handler (HTTP-01 webroot, validated inputs)

120s timeout. Invalid domain/email is rejected before certbot is invoked.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Certbot `renew` handler

**Files:**
- Modify: `apps/helper/internal/helper/certbot.go`
- Modify: `apps/helper/internal/helper/certbot_test.go`

**Behaviour:**
- No params.
- Run: `<CertbotBin> renew --webroot -w <AcmeWebroot> -n --no-random-sleep-on-renew` with a 300-second timeout (renews can be batched).
- Capture stdout; certbot prints a per-cert summary.
- On exit 0: return `{"renewed": true, "stdout": "<truncated stdout>"}`.
- On non-zero: `certbot_renew_failed` with stderr.

- [ ] **Step 1: Add the failing tests**

Append to `apps/helper/internal/helper/certbot_test.go`:

```go
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build error `undefined: CertbotRenew`.

- [ ] **Step 3: Add `CertbotRenew`**

Append to `apps/helper/internal/helper/certbot.go`:

```go
const certbotRenewTimeout = 300 * time.Second

// CertbotRenew renews all managed certs that are due. Safe to call frequently;
// certbot is a no-op for certs not due for renewal.
func (h *Handlers) CertbotRenew(ctx context.Context) Response {
	ctx, cancel := context.WithTimeout(ctx, certbotRenewTimeout)
	defer cancel()
	args := []string{"renew", "--webroot", "-w", h.Cfg.AcmeWebroot, "-n", "--no-random-sleep-on-renew"}
	stdout, stderr, code, err := h.Runner.Run(ctx, h.Cfg.CertbotBin, args...)
	if err != nil {
		return ErrorResponse("certbot_renew_failed", "could not exec certbot renew: "+err.Error(), string(stderr))
	}
	if code != 0 {
		return ErrorResponse("certbot_renew_failed", fmt.Sprintf("certbot renew exited %d", code), string(stderr))
	}
	summary := string(stdout)
	if len(summary) > 4096 {
		summary = summary[:4096] + "…[truncated]"
	}
	return SuccessResponse(map[string]any{"renewed": true, "stdout": summary})
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/certbot.go apps/helper/internal/helper/certbot_test.go
git commit -m "$(cat <<'EOF'
helper: add certbot.renew handler (300s timeout, safe to call any time)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Server (accept loop + dispatch)

**Files:**
- Create: `apps/helper/internal/helper/server.go`
- Create: `apps/helper/internal/helper/server_test.go`

**Behaviour:**
- `Server.Serve(ctx, listener)` runs an accept loop. Each accepted connection:
  1. Set a 30-second read deadline.
  2. `ReadFrame` to get the request payload.
  3. Decode JSON into `Request`.
  4. Dispatch by `Command` to the matching handler. Unknown command → `unknown_command`.
  5. Marshal `Response`, `WriteFrame` back.
  6. Close the connection.
- On `ctx.Done()`, stop accepting, allow in-flight to finish (best-effort), return.
- Server uses `net.Listener` so tests can pass `net.Pipe`-backed listeners.

- [ ] **Step 1: Write the failing tests**

Create `apps/helper/internal/helper/server_test.go`:

```go
package helper

import (
	"context"
	"encoding/json"
	"net"
	"sync"
	"testing"
	"time"
)

// inMemListener exposes a net.Listener whose connections come from net.Pipe.
type inMemListener struct {
	ch     chan net.Conn
	closed chan struct{}
	once   sync.Once
}

func newInMemListener() *inMemListener {
	return &inMemListener{ch: make(chan net.Conn), closed: make(chan struct{})}
}

func (l *inMemListener) Accept() (net.Conn, error) {
	select {
	case c := <-l.ch:
		return c, nil
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

func (l *inMemListener) Close() error {
	l.once.Do(func() { close(l.closed) })
	return nil
}

func (l *inMemListener) Addr() net.Addr { return &net.UnixAddr{Name: "memory", Net: "unix"} }

func (l *inMemListener) Dial() net.Conn {
	clientSide, serverSide := net.Pipe()
	l.ch <- serverSide
	return clientSide
}

func runRoundTrip(t *testing.T, listener *inMemListener, req Request) Response {
	t.Helper()
	conn := listener.Dial()
	defer conn.Close()
	payload, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal req: %v", err)
	}
	if err := WriteFrame(conn, payload); err != nil {
		t.Fatalf("WriteFrame: %v", err)
	}
	respBytes, err := ReadFrame(conn)
	if err != nil {
		t.Fatalf("ReadFrame: %v", err)
	}
	var resp Response
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		t.Fatalf("unmarshal resp: %v", err)
	}
	return resp
}

func TestServer_DispatchesNginxReload(t *testing.T) {
	runner := &FakeRunner{Responses: []FakeResponse{{ExitCode: 0}, {ExitCode: 0}}}
	h := &Handlers{
		Cfg:    Config{NginxBin: "/usr/sbin/nginx", SystemctlBin: "/bin/systemctl"},
		Runner: runner,
	}
	srv := &Server{Handlers: h}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- srv.Serve(ctx, listener) }()

	resp := runRoundTrip(t, listener, Request{Command: "nginx.reload"})
	if !resp.OK {
		t.Fatalf("expected ok, got %+v", resp)
	}

	cancel()
	if err := <-done; err != nil && err != context.Canceled && err != net.ErrClosed {
		t.Fatalf("Serve returned unexpected error: %v", err)
	}
}

func TestServer_UnknownCommand(t *testing.T) {
	h := &Handlers{Cfg: Config{}, Runner: &FakeRunner{}}
	srv := &Server{Handlers: h}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.Serve(ctx, listener)

	resp := runRoundTrip(t, listener, Request{Command: "doom.activate"})
	if resp.OK || resp.Error != "unknown_command" {
		t.Fatalf("expected unknown_command, got %+v", resp)
	}
}

func TestServer_BadJSONInFrame(t *testing.T) {
	srv := &Server{Handlers: &Handlers{Cfg: Config{}, Runner: &FakeRunner{}}}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.Serve(ctx, listener)

	conn := listener.Dial()
	defer conn.Close()
	if err := WriteFrame(conn, []byte("not json")); err != nil {
		t.Fatalf("WriteFrame: %v", err)
	}
	respBytes, err := ReadFrame(conn)
	if err != nil {
		t.Fatalf("ReadFrame: %v", err)
	}
	var resp Response
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		t.Fatalf("unmarshal resp: %v", err)
	}
	if resp.OK || resp.Error != "bad_request" {
		t.Fatalf("expected bad_request, got %+v", resp)
	}
}

func TestServer_ReadDeadlineFires(t *testing.T) {
	srv := &Server{
		Handlers:    &Handlers{Cfg: Config{}, Runner: &FakeRunner{}},
		ReadTimeout: 50 * time.Millisecond,
	}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.Serve(ctx, listener)

	conn := listener.Dial()
	defer conn.Close()
	// Never send anything; server should give up and close.
	buf := make([]byte, 1)
	conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, err := conn.Read(buf)
	if err == nil {
		t.Fatal("expected the server-side to close, got read success")
	}
}
```

- [ ] **Step 2: Run the tests to confirm they fail**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: build errors `undefined: Server`.

- [ ] **Step 3: Implement `server.go`**

Create `apps/helper/internal/helper/server.go`:

```go
package helper

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"time"
)

// Server is the helper's accept loop.
type Server struct {
	Handlers    *Handlers
	ReadTimeout time.Duration // default 30s
	WriteTimeout time.Duration // default 5s
	Log         *slog.Logger  // optional; defaults to slog.Default()
}

// Serve runs the accept loop until ctx is cancelled or listener closes.
func (s *Server) Serve(ctx context.Context, l net.Listener) error {
	readTO := s.ReadTimeout
	if readTO == 0 {
		readTO = 30 * time.Second
	}
	writeTO := s.WriteTimeout
	if writeTO == 0 {
		writeTO = 5 * time.Second
	}
	logger := s.Log
	if logger == nil {
		logger = slog.Default()
	}

	// Close the listener on ctx.Done so Accept unblocks.
	go func() {
		<-ctx.Done()
		_ = l.Close()
	}()

	for {
		conn, err := l.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) || ctx.Err() != nil {
				return ctx.Err()
			}
			logger.Warn("accept error", "err", err)
			continue
		}
		go s.handle(ctx, conn, readTO, writeTO, logger)
	}
}

func (s *Server) handle(ctx context.Context, conn net.Conn, readTO, writeTO time.Duration, logger *slog.Logger) {
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(readTO))
	payload, err := ReadFrame(conn)
	if err != nil {
		logger.Info("read frame failed", "err", err)
		return
	}
	var req Request
	resp := s.dispatch(ctx, payload, &req)
	_ = conn.SetWriteDeadline(time.Now().Add(writeTO))
	out, err := json.Marshal(resp)
	if err != nil {
		logger.Error("marshal response failed", "err", err)
		return
	}
	if err := WriteFrame(conn, out); err != nil {
		logger.Info("write frame failed", "err", err, "command", req.Command)
		return
	}
	logger.Info("handled", "command", req.Command, "ok", resp.OK, "error", resp.Error)
}

func (s *Server) dispatch(ctx context.Context, payload []byte, req *Request) Response {
	if err := json.Unmarshal(payload, req); err != nil {
		return ErrorResponse("bad_request", "request not valid JSON", err.Error())
	}
	switch req.Command {
	case "nginx.write_config":
		return s.Handlers.NginxWriteConfig(ctx, req.Params)
	case "nginx.reload":
		return s.Handlers.NginxReload(ctx)
	case "certbot.issue":
		return s.Handlers.CertbotIssue(ctx, req.Params)
	case "certbot.renew":
		return s.Handlers.CertbotRenew(ctx)
	default:
		return ErrorResponse("unknown_command", "command not recognised: "+req.Command, "")
	}
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

From `apps/helper/`, run:

```bash
go test ./internal/helper/...
```

Expected: all tests pass. (The deadline test uses `net.Pipe`, which honours `SetReadDeadline` since Go 1.10, so this works in-memory.)

- [ ] **Step 5: Commit**

```bash
git add apps/helper/internal/helper/server.go apps/helper/internal/helper/server_test.go
git commit -m "$(cat <<'EOF'
helper: add Server (accept loop, framed JSON dispatch, deadlines)

Allow-list dispatch over four commands. Anything else returns
unknown_command. 30s read deadline, 5s write deadline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Main entry point (socket setup, signal handling, graceful shutdown)

**Files:**
- Create: `apps/helper/cmd/projectmng-helper/main.go`

**Behaviour:**
- Read `Config` from env vars with documented defaults.
- Resolve socket path from `PROJECTMNG_SOCKET_PATH` (default `/run/projectmng/helper.sock`) and `PROJECTMNG_SOCKET_GROUP` (default `projectmng`).
- Unlink any stale socket file at that path (the previous instance may have crashed).
- `net.Listen("unix", path)`.
- `os.Chmod(path, 0o660)`. If `PROJECTMNG_SOCKET_GROUP` is set, look up the GID and `os.Chown(path, -1, gid)`.
- Build `Handlers{Cfg, Runner: &RealRunner{}, Writer: RealWriter{}}` and `Server{Handlers: ...}`.
- Wait for SIGINT/SIGTERM; cancel ctx; let `Serve` return; exit 0. On error, log to stderr and exit 1.

- [ ] **Step 1: Write the entry point**

Create `apps/helper/cmd/projectmng-helper/main.go`:

```go
// projectmng-helper runs as root via systemd and exposes a Unix-socket
// JSON-RPC API with four allow-listed commands. See the package README.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"strconv"
	"syscall"

	"github.com/projectmng/projectmng/apps/helper/internal/helper"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{}))
	slog.SetDefault(logger)

	if err := run(logger); err != nil {
		logger.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func envOr(key, dflt string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return dflt
}

func run(logger *slog.Logger) error {
	cfg := helper.Config{
		NginxBin:       envOr("PROJECTMNG_NGINX_BIN", "/usr/sbin/nginx"),
		SystemctlBin:   envOr("PROJECTMNG_SYSTEMCTL_BIN", "/bin/systemctl"),
		CertbotBin:     envOr("PROJECTMNG_CERTBOT_BIN", "/usr/bin/certbot"),
		NginxConfigDir: envOr("PROJECTMNG_NGINX_CONFIG_DIR", "/etc/nginx/sites-enabled/managed"),
		AcmeWebroot:    envOr("PROJECTMNG_ACME_WEBROOT", "/var/www/_acme"),
	}
	socketPath := envOr("PROJECTMNG_SOCKET_PATH", "/run/projectmng/helper.sock")
	socketGroup := envOr("PROJECTMNG_SOCKET_GROUP", "projectmng")

	if err := os.MkdirAll(filepath.Dir(socketPath), 0o755); err != nil {
		return err
	}
	if err := os.RemoveAll(socketPath); err != nil {
		return err
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return err
	}
	defer listener.Close()
	if err := os.Chmod(socketPath, 0o660); err != nil {
		return err
	}
	if socketGroup != "" {
		gid, err := lookupGID(socketGroup)
		if err != nil {
			return err
		}
		if err := os.Chown(socketPath, -1, gid); err != nil {
			return err
		}
	}

	handlers := &helper.Handlers{
		Cfg:    cfg,
		Runner: &helper.RealRunner{},
		Writer: helper.RealWriter{},
	}
	srv := &helper.Server{Handlers: handlers, Log: logger}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("listening", "socket", socketPath)
	err = srv.Serve(ctx, listener)
	if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, net.ErrClosed) {
		return err
	}
	logger.Info("shutdown complete")
	return nil
}

func lookupGID(group string) (int, error) {
	g, err := user.LookupGroup(group)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(g.Gid)
}
```

- [ ] **Step 2: Build the binary to make sure main compiles**

From `apps/helper/`, run:

```bash
go build ./cmd/projectmng-helper
```

Expected: produces `apps/helper/projectmng-helper` (which is in `.gitignore`); exits 0 with no warnings.

- [ ] **Step 3: Run the full unit-test suite to confirm nothing regressed**

From `apps/helper/`, run:

```bash
go test ./...
```

Expected: all tests in `./internal/helper/...` pass; `./cmd/...` has no tests.

- [ ] **Step 4: Commit**

```bash
git add apps/helper/cmd/projectmng-helper/main.go
git commit -m "$(cat <<'EOF'
helper: add main entry point with env-driven config and graceful shutdown

Listens on $PROJECTMNG_SOCKET_PATH (default /run/projectmng/helper.sock),
chmod 0660, chown :projectmng. Cancels on SIGINT/SIGTERM.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Systemd unit and tmpfiles.d snippet

**Files:**
- Create: `apps/helper/systemd/projectmng-helper.service`
- Create: `apps/helper/systemd/projectmng-helper.tmpfiles`

- [ ] **Step 1: Create the systemd service unit**

Create `apps/helper/systemd/projectmng-helper.service`:

```ini
[Unit]
Description=projectmng privileged helper (nginx + certbot operations)
After=network.target nginx.service
Wants=nginx.service

[Service]
Type=notify
ExecStart=/usr/local/bin/projectmng-helper
Restart=on-failure
RestartSec=2s
User=root
Group=root

# Sandboxing — projectmng-helper does not need most of the host.
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
PrivateTmp=yes
LockPersonality=yes
RestrictRealtime=yes
RestrictNamespaces=yes
RestrictSUIDSGID=yes
SystemCallArchitectures=native

# Filesystem write access — exactly what the four commands need, nothing more.
ReadWritePaths=/run/projectmng /etc/nginx/sites-enabled/managed /etc/letsencrypt /var/lib/letsencrypt /var/log/letsencrypt /var/www/_acme

# Capabilities — we don't actually need any capabilities ourselves; we shell
# out to nginx/systemctl/certbot which run with their own permissions.
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
```

Note on `Type=notify`: this uses systemd readiness notification. Our binary doesn't call `sd_notify` yet (a small follow-up could add it via `golang.org/x/sys/unix` or by writing to `$NOTIFY_SOCKET` directly). Until then, change `Type=notify` to `Type=simple` in the unit so systemd doesn't wait for a notification that never comes. Update the file accordingly: replace the `Type=notify` line with:

```ini
Type=simple
```

(We accept the marginal loss of readiness reporting in v1; adding `sd_notify` is a small later improvement that doesn't affect correctness.)

- [ ] **Step 2: Create the tmpfiles.d snippet**

Create `apps/helper/systemd/projectmng-helper.tmpfiles`:

```
# /run/projectmng must exist before the service starts; systemd-tmpfiles
# (re)creates it at boot. Owner root, group projectmng, mode 0750.
d /run/projectmng 0750 root projectmng -
```

- [ ] **Step 3: Verify the install target packages the files correctly**

From `apps/helper/`, run a dry-run install into a staging directory:

```bash
make build
make install DESTDIR=/tmp/projectmng-helper-stage
ls -laR /tmp/projectmng-helper-stage
```

Expected output should show three files:

```
/tmp/projectmng-helper-stage/usr/local/bin/projectmng-helper
/tmp/projectmng-helper-stage/etc/systemd/system/projectmng-helper.service
/tmp/projectmng-helper-stage/usr/lib/tmpfiles.d/projectmng-helper.conf
```

Clean up: `rm -rf /tmp/projectmng-helper-stage`.

- [ ] **Step 4: Commit**

```bash
git add apps/helper/systemd/projectmng-helper.service apps/helper/systemd/projectmng-helper.tmpfiles
git commit -m "$(cat <<'EOF'
helper: add systemd unit and tmpfiles.d snippet

Hardened unit: ProtectSystem=strict, empty capability bounding set,
ReadWritePaths limited to the four directories the handlers actually touch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Smoke client (`projectmng-helper-cli`)

**Files:**
- Create: `apps/helper/cmd/projectmng-helper-cli/main.go`

**Purpose:** a tiny CLI that lets you hit the socket from a shell during development and debugging. Not a production tool. Useful for manual verification during Task 14 and for ad-hoc operator inspection later.

**Usage:**
```
projectmng-helper-cli [--socket /run/projectmng/helper.sock] <command> [<json-params>]
```

Examples:
```
projectmng-helper-cli nginx.reload
projectmng-helper-cli nginx.write_config '{"name":"hello","content":"server { return 200; }"}'
```

- [ ] **Step 1: Implement the CLI**

Create `apps/helper/cmd/projectmng-helper-cli/main.go`:

```go
// projectmng-helper-cli is a developer/debug client for the helper socket.
// It is not intended for production use; the real client is the platform's
// pm-api / pm-worker.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"time"

	"github.com/projectmng/projectmng/apps/helper/internal/helper"
)

func main() {
	socket := flag.String("socket", "/run/projectmng/helper.sock", "path to helper Unix socket")
	timeout := flag.Duration("timeout", 30*time.Second, "round-trip timeout")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: projectmng-helper-cli [--socket PATH] [--timeout DUR] <command> [<json-params>]")
		flag.PrintDefaults()
	}
	flag.Parse()
	args := flag.Args()
	if len(args) < 1 {
		flag.Usage()
		os.Exit(2)
	}
	command := args[0]
	var params json.RawMessage
	if len(args) >= 2 {
		if !json.Valid([]byte(args[1])) {
			fmt.Fprintln(os.Stderr, "params: not valid JSON")
			os.Exit(2)
		}
		params = json.RawMessage(args[1])
	}

	conn, err := net.Dial("unix", *socket)
	if err != nil {
		fmt.Fprintln(os.Stderr, "dial:", err)
		os.Exit(1)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(*timeout))

	req := helper.Request{Command: command, Params: params}
	payload, err := json.Marshal(req)
	if err != nil {
		fmt.Fprintln(os.Stderr, "marshal:", err)
		os.Exit(1)
	}
	if err := helper.WriteFrame(conn, payload); err != nil {
		fmt.Fprintln(os.Stderr, "write:", err)
		os.Exit(1)
	}
	respBytes, err := helper.ReadFrame(conn)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read:", err)
		os.Exit(1)
	}
	var resp helper.Response
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		fmt.Fprintln(os.Stderr, "unmarshal:", err)
		os.Exit(1)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(resp)
	if !resp.OK {
		os.Exit(1)
	}
}
```

- [ ] **Step 2: Build both binaries to make sure everything compiles**

From `apps/helper/`, run:

```bash
make build
```

Expected: produces `apps/helper/bin/projectmng-helper` and `apps/helper/bin/projectmng-helper-cli`.

- [ ] **Step 3: Smoke-test the CLI locally against an isolated helper instance**

This step is optional on macOS (the helper itself will refuse to use the default certbot/nginx paths, but we can override them with env vars to non-existent binaries and still exercise the dispatch loop). From `apps/helper/`:

```bash
# Start the helper in a temp dir with a non-default socket.
SOCK=$(mktemp -d)/helper.sock
PROJECTMNG_SOCKET_PATH=$SOCK \
PROJECTMNG_SOCKET_GROUP= \
PROJECTMNG_NGINX_CONFIG_DIR=$(mktemp -d) \
./bin/projectmng-helper &
HELPER_PID=$!
sleep 0.2

# Try an unknown command — should return an error response cleanly.
./bin/projectmng-helper-cli --socket "$SOCK" doom.activate || true

# Try writing a config — should succeed (writer is real, but to a tempdir).
./bin/projectmng-helper-cli --socket "$SOCK" nginx.write_config '{"name":"hello","content":"server { return 200; }"}'

kill $HELPER_PID
```

Expected: the `doom.activate` call prints `{"ok":false,"error":"unknown_command",...}` and exits 1; the `nginx.write_config` call prints `{"ok":true,"data":{"path":"...","bytes":...}}` and exits 0.

If you're on Linux and want to also try `nginx.reload`/`certbot.*`, override `PROJECTMNG_NGINX_BIN=/bin/true`, `PROJECTMNG_SYSTEMCTL_BIN=/bin/true`, `PROJECTMNG_CERTBOT_BIN=/bin/true` to make the calls succeed without any side effects.

- [ ] **Step 4: Commit**

```bash
git add apps/helper/cmd/projectmng-helper-cli/main.go
git commit -m "$(cat <<'EOF'
helper: add projectmng-helper-cli (developer/debug client)

Tiny stdlib-only client for hitting the socket from a shell. Not the
production client — that's pm-api / pm-worker. Useful for smoke tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: README finalisation + integration test scaffold

**Files:**
- Modify: `apps/helper/README.md`
- Create: `apps/helper/internal/helper/integration_test.go`
- Create: `apps/helper/testdata/nginx-snippets/managed-site.conf`

**Why an integration test scaffold:** the unit tests use a `FakeRunner`, which proves the dispatch logic is correct but not that the real binary actually reloads a real nginx. The scaffold below is a Go integration test guarded by the `integration` build tag. It only runs on Linux with Docker available; on macOS it is skipped. This task creates the file with one passing test (a self-test of the harness) and one skipped test that documents how to do the full nginx round trip — the full integration suite is intentionally out of scope for v1 of the helper but the entry point exists.

- [ ] **Step 1: Add a sample managed nginx config used by tests and docs**

Create `apps/helper/testdata/nginx-snippets/managed-site.conf`:

```nginx
# Sample managed nginx site config — used by integration tests and as a
# reference for what the platform will write into
# /etc/nginx/sites-enabled/managed/<slug>.conf at runtime.
server {
    listen 80;
    server_name example.test;

    location /.well-known/acme-challenge/ {
        root /var/www/_acme;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

- [ ] **Step 2: Create the integration test scaffold**

Create `apps/helper/internal/helper/integration_test.go`:

```go
//go:build integration

package helper

import (
	"os"
	"os/exec"
	"runtime"
	"testing"
)

// TestIntegration_HarnessSanity confirms the integration build tag is wired
// up correctly. If you ran `go test -tags=integration ./...` and this test
// doesn't appear in the output, the file isn't being included.
func TestIntegration_HarnessSanity(t *testing.T) {
	t.Logf("integration harness OK on %s/%s", runtime.GOOS, runtime.GOARCH)
}

// TestIntegration_NginxReloadAgainstRealNginx documents the full integration
// test we'll add when packaging Plan 4 lands a docker-based test runner.
//
// To turn this on:
//   1. Run an nginx container with /etc/nginx/sites-enabled bind-mounted
//      from a tempdir and -p 8080:80 published.
//   2. Set PROJECTMNG_NGINX_BIN=/usr/bin/docker, but rather than that, run
//      the helper inside the container so it shares /etc/nginx.
//   3. Hit the helper's socket from this test using net.Dial("unix", path).
//   4. Assert the new server block is reachable via curl.
//
// Until then, this test is skipped — the unit tests cover the dispatch logic
// and the FakeRunner script verifies argument shapes byte-for-byte.
func TestIntegration_NginxReloadAgainstRealNginx(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not available; integration test requires Docker")
	}
	if os.Getenv("PROJECTMNG_RUN_FULL_INTEGRATION") != "1" {
		t.Skip("set PROJECTMNG_RUN_FULL_INTEGRATION=1 to opt in; see test docstring")
	}
	t.Skip("not implemented yet — tracked separately; see Plan 4")
}
```

- [ ] **Step 3: Run the integration suite to confirm the scaffold is wired**

From `apps/helper/`, run:

```bash
make test-integration
```

Expected output includes:

```
--- PASS: TestIntegration_HarnessSanity
--- SKIP: TestIntegration_NginxReloadAgainstRealNginx
```

And:

```bash
make test
```

Expected: the integration file is excluded (no integration tests run), unit tests pass.

- [ ] **Step 4: Polish the README**

Replace `apps/helper/README.md` with:

```markdown
# projectmng-helper

The privileged root surface for the projectMng platform. A small Go binary
(stdlib only) that runs as root via systemd and accepts exactly four commands
over a Unix socket:

| Command              | Params                                   | What it does |
|----------------------|------------------------------------------|--------------|
| `nginx.write_config` | `{"name": "<slug>", "content": "..."}`   | Atomically writes `<ConfigDir>/<slug>.conf` (mode 0640). Does **not** reload. |
| `nginx.reload`       | (none)                                   | Runs `nginx -t`, then `systemctl reload nginx`. Validates first; refuses to reload a broken config. |
| `certbot.issue`      | `{"domain": "...", "email": "..."}`      | Runs `certbot certonly --webroot -w <AcmeWebroot> -d <domain> -n --agree-tos --email <email>`. 120s timeout. |
| `certbot.renew`      | (none)                                   | Runs `certbot renew --webroot -w <AcmeWebroot> -n --no-random-sleep-on-renew`. 300s timeout. |

Anything else returns `{"ok": false, "error": "unknown_command", ...}`. Inputs
are strictly validated before reaching `exec`. All shelled-out commands use
absolute paths; `$PATH` is never consulted; child processes inherit an empty
environment.

## Wire protocol

One request per connection. 4-byte big-endian uint32 length prefix, then a
JSON payload. Max payload 1 MiB. Server closes the connection after
responding. See `internal/helper/protocol.go` for the exact types.

## Configuration

All paths are overridable via env vars; defaults match the Debian/Ubuntu
package layout:

| Env var | Default |
|---------|---------|
| `PROJECTMNG_SOCKET_PATH`     | `/run/projectmng/helper.sock` |
| `PROJECTMNG_SOCKET_GROUP`    | `projectmng` (empty disables chown) |
| `PROJECTMNG_NGINX_BIN`       | `/usr/sbin/nginx` |
| `PROJECTMNG_SYSTEMCTL_BIN`   | `/bin/systemctl` |
| `PROJECTMNG_CERTBOT_BIN`     | `/usr/bin/certbot` |
| `PROJECTMNG_NGINX_CONFIG_DIR`| `/etc/nginx/sites-enabled/managed` |
| `PROJECTMNG_ACME_WEBROOT`    | `/var/www/_acme` |

## Building

```
make build           # produces bin/projectmng-helper and bin/projectmng-helper-cli
```

## Testing

```
make test                # unit tests (anywhere)
make test-integration    # integration tests (Linux + Docker; mostly skipped in v1)
```

## Installing on a host

```
sudo make install
sudo systemd-tmpfiles --create /usr/lib/tmpfiles.d/projectmng-helper.conf
sudo systemctl daemon-reload
sudo systemctl enable --now projectmng-helper
```

Prerequisites:

- A `projectmng` system user/group: `sudo groupadd -r projectmng && sudo useradd -r -g projectmng -s /usr/sbin/nologin projectmng`
- An empty managed config dir, root-owned, group `projectmng`, group-writable: `sudo install -d -o root -g projectmng -m 2770 /etc/nginx/sites-enabled/managed`
- The certbot webroot: `sudo install -d -o root -g root -m 0755 /var/www/_acme`
- nginx and certbot installed (`apt install nginx certbot`)
- nginx's `http {}` block includes `include /etc/nginx/sites-enabled/managed/*.conf;`

## Debug CLI

```
projectmng-helper-cli nginx.reload
projectmng-helper-cli nginx.write_config '{"name":"hello","content":"server { listen 127.0.0.1:10000; return 200; }"}'
```

## Security notes

- The helper is the only root surface the platform trusts. The full source is
  ~600 LOC (including tests) and dependency-free, so it is auditable in a
  single sitting.
- `RealRunner` refuses any binary name that isn't an absolute path and runs
  children with an empty `env`. There is no `$PATH` lookup, ever.
- `nginx.reload` always runs `nginx -t` first and bails out on failure, so a
  caller can't crash the nginx master with a broken managed config.
- The systemd unit uses `ProtectSystem=strict` with a small `ReadWritePaths`
  whitelist, an empty capability bounding set, `NoNewPrivileges=yes`, and
  several other hardening knobs. See `systemd/projectmng-helper.service`.
```

- [ ] **Step 5: Run the full test matrix one more time**

From `apps/helper/`, run:

```bash
make lint && make test && make test-integration && make build
```

Expected: lint clean, all unit tests pass, integration harness sanity test passes (full integration test skipped), both binaries built into `bin/`.

- [ ] **Step 6: Commit**

```bash
git add apps/helper/README.md \
        apps/helper/internal/helper/integration_test.go \
        apps/helper/testdata/nginx-snippets/managed-site.conf
git commit -m "$(cat <<'EOF'
helper: finalise README, add integration test scaffold and sample config

README now documents the wire protocol, env vars, install steps, and security
posture. Integration test file is wired behind the 'integration' build tag
with a sanity test and a documented entry point for the full nginx round
trip (deferred to Plan 4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Done — what you have at the end of Plan 1

- A self-contained Go module at `apps/helper/` (~600 LOC including tests), zero third-party dependencies.
- Two binaries: `projectmng-helper` (the daemon) and `projectmng-helper-cli` (a debug client).
- A hardened systemd unit + tmpfiles.d snippet that installs cleanly via `sudo make install`.
- Unit tests covering: framing, validation (name/domain/email), real+fake runners, atomic writes, all four command handlers, server accept loop and dispatch.
- An integration test scaffold ready for Plan 4 to extend.
- A README operators can follow to install the helper on a fresh Debian/Ubuntu VPS.

The helper is now the trusted root surface that Plan 2 (platform core) will dial into via Unix socket. Plan 2 can mock the helper for unit tests using the wire protocol defined here (`internal/helper/protocol.go` is exported from this module — or Plan 2 can re-define an equivalent client type locally, both work).
