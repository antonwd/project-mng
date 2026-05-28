// Package cli wires the projectmng day-2 subcommands. Each subcommand
// uses CommandRunner so the tests can swap in a fake. Keep stdlib-only.
package cli

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// CommandRunner runs external commands; satisfied by RealRunner in
// production and FakeRunner in tests.
type CommandRunner interface {
	Run(ctx context.Context, name string, args []string, opts RunOpts) (RunResult, error)
}

type RunOpts struct {
	Stdin  io.Reader
	Env    []string
	Dir    string
	Stdout io.Writer
	Stderr io.Writer
}

type RunResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

// RealRunner shells out via os/exec.
type RealRunner struct{}

func (RealRunner) Run(ctx context.Context, name string, args []string, opts RunOpts) (RunResult, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	if opts.Stdin != nil {
		cmd.Stdin = opts.Stdin
	}
	if len(opts.Env) > 0 {
		cmd.Env = opts.Env
	}
	if opts.Dir != "" {
		cmd.Dir = opts.Dir
	}
	var stdout, stderr strings.Builder
	if opts.Stdout != nil {
		cmd.Stdout = io.MultiWriter(&stdout, opts.Stdout)
	} else {
		cmd.Stdout = &stdout
	}
	if opts.Stderr != nil {
		cmd.Stderr = io.MultiWriter(&stderr, opts.Stderr)
	} else {
		cmd.Stderr = &stderr
	}
	err := cmd.Run()
	r := RunResult{Stdout: stdout.String(), Stderr: stderr.String()}
	if ee, ok := err.(*exec.ExitError); ok {
		r.ExitCode = ee.ExitCode()
		return r, fmt.Errorf("%s: exit %d", name, r.ExitCode)
	}
	return r, err
}

// FakeRunner records calls and returns scripted responses.
type FakeRunner struct {
	Calls   []FakeCall
	Replies []RunResult
	Errors  []error
}

type FakeCall struct {
	Name string
	Args []string
	Opts RunOpts
}

func (f *FakeRunner) Run(_ context.Context, name string, args []string, opts RunOpts) (RunResult, error) {
	f.Calls = append(f.Calls, FakeCall{Name: name, Args: args, Opts: opts})
	var res RunResult
	if len(f.Replies) > 0 {
		res = f.Replies[0]
		f.Replies = f.Replies[1:]
	}
	var err error
	if len(f.Errors) > 0 {
		err = f.Errors[0]
		f.Errors = f.Errors[1:]
	}
	return res, err
}

// FS abstracts the filesystem operations the subcommands need (the
// real impl just calls os.*). Lets us test backup/restore against
// in-memory temp dirs cleanly.
type FS interface {
	Stat(string) (os.FileInfo, error)
	ReadFile(string) ([]byte, error)
	WriteFile(name string, data []byte, perm os.FileMode) error
	RemoveAll(string) error
	MkdirAll(name string, perm os.FileMode) error
}

type RealFS struct{}

func (RealFS) Stat(name string) (os.FileInfo, error)               { return os.Stat(name) }
func (RealFS) ReadFile(name string) ([]byte, error)                { return os.ReadFile(name) }
func (RealFS) WriteFile(name string, data []byte, p os.FileMode) error {
	return os.WriteFile(name, data, p)
}
func (RealFS) RemoveAll(name string) error               { return os.RemoveAll(name) }
func (RealFS) MkdirAll(name string, p os.FileMode) error { return os.MkdirAll(name, p) }
