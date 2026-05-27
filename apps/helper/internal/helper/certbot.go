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
