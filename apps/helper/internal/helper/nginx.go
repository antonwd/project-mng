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
