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
//  1. Run an nginx container with /etc/nginx/sites-enabled bind-mounted
//     from a tempdir and -p 8080:80 published.
//  2. Set PROJECTMNG_NGINX_BIN=/usr/bin/docker, but rather than that, run
//     the helper inside the container so it shares /etc/nginx.
//  3. Hit the helper's socket from this test using net.Dial("unix", path).
//  4. Assert the new server block is reachable via curl.
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
