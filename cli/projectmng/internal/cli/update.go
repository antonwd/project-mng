package cli

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
)

// Update pulls the new images for the version recorded in PROJECTMNG_OPT/.version
// (or the value passed via WantVersion), then runs `docker compose pull` and
// `docker compose up -d`, then applies migrations.
//
// This is intentionally smaller than install.sh — it doesn't touch the helper
// binary or systemd unit. To swap helper versions, re-run install.sh.
type UpdateOpts struct {
	WantVersion string // optional override; empty → use whatever is in .env
	Paths       Paths
	Runner      CommandRunner
	FS          FS
	Out         io.Writer
}

func Update(ctx context.Context, opts UpdateOpts) error {
	if opts.Out == nil {
		opts.Out = os.Stdout
	}
	if opts.Paths.ComposeFile == "" {
		opts.Paths = LoadPathsFromEnv()
	}
	if opts.Runner == nil {
		opts.Runner = RealRunner{}
	}
	if opts.FS == nil {
		opts.FS = RealFS{}
	}

	if opts.WantVersion != "" {
		if err := patchEnvVersion(opts.FS, opts.Paths.EnvFile, opts.WantVersion); err != nil {
			return fmt.Errorf("update VERSION in %s: %w", opts.Paths.EnvFile, err)
		}
		fmt.Fprintf(opts.Out, "[update] pinned VERSION=%s in %s\n", opts.WantVersion, opts.Paths.EnvFile)
	}

	steps := [][]string{
		{"docker", "compose", "-f", opts.Paths.ComposeFile, "pull"},
		{"docker", "compose", "-f", opts.Paths.ComposeFile, "up", "-d"},
		{"docker", "compose", "-f", opts.Paths.ComposeFile, "exec", "-T", "pm-api", "npm", "run", "db:migrate"},
	}
	for _, s := range steps {
		fmt.Fprintf(opts.Out, "[update] $ %s\n", strings.Join(s, " "))
		if _, err := opts.Runner.Run(ctx, s[0], s[1:], RunOpts{Stdout: opts.Out, Stderr: opts.Out}); err != nil {
			return fmt.Errorf("%s: %w", strings.Join(s, " "), err)
		}
	}

	if opts.WantVersion != "" {
		if err := opts.FS.WriteFile(opts.Paths.VersionFile, []byte(opts.WantVersion+"\n"), 0o644); err != nil {
			return err
		}
	}
	fmt.Fprintln(opts.Out, "[update] done")
	return nil
}

// patchEnvVersion rewrites the VERSION=... line of an env file or appends one.
func patchEnvVersion(fs FS, path, version string) error {
	data, err := fs.ReadFile(path)
	if err != nil {
		return err
	}
	var out strings.Builder
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	replaced := false
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "VERSION=") {
			out.WriteString("VERSION=" + version + "\n")
			replaced = true
			continue
		}
		out.WriteString(line + "\n")
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if !replaced {
		out.WriteString("VERSION=" + version + "\n")
	}
	// 0o600: install.sh tightens to 0o400 after generation, but the update path
	// needs write access. On a real host the .env is root-owned so this is fine;
	// the looser mode only persists while the rewrite is in flight.
	return fs.WriteFile(path, []byte(out.String()), 0o600)
}
