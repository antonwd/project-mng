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
		// Surface context cancellation/timeout explicitly rather than masking
		// it as a normal non-zero exit — the caller needs to know the process
		// was killed by us, not that it ran to completion with a bad code.
		if ctxErr := ctx.Err(); ctxErr != nil {
			return stdout.Bytes(), stderr.Bytes(), code, ctxErr
		}
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
