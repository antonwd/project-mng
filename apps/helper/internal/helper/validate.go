package helper

import (
	"errors"
	"fmt"
	"strings"
)

const (
	maxDomainLen  = 253
	maxLabelLen   = 63
	maxEmailLen   = 254
	maxEmailLocal = 64 // RFC 5321 §4.5.3.1.1
	maxNameLen    = 63
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
	if len(local) > maxEmailLocal {
		return fmt.Errorf("email local part length %d exceeds max %d", len(local), maxEmailLocal)
	}
	if strings.ContainsAny(email, " \t\r\n") {
		return errors.New("email contains whitespace")
	}
	if !strings.Contains(domain, ".") {
		return errors.New("email domain must contain a dot")
	}
	return nil
}
