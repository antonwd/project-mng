package cli

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
)

type RestoreOpts struct {
	Src    string
	Force  bool
	Paths  Paths
	Runner CommandRunner
	FS     FS
	Out    io.Writer
}

// Restore reads a backup tarball and reinstates files + pg dump. Refuses to
// proceed if /etc/projectmng/master.key already exists unless Force is set.
func Restore(ctx context.Context, opts RestoreOpts) error {
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
	if opts.Src == "" {
		return errors.New("restore: source path is required")
	}
	if _, err := opts.FS.Stat(opts.Paths.MasterKey); err == nil && !opts.Force {
		return fmt.Errorf("refusing to restore over existing install (use --force to override)")
	}

	src, err := os.Open(opts.Src)
	if err != nil {
		return err
	}
	defer src.Close()
	gz, err := gzip.NewReader(src)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)

	if err := opts.FS.MkdirAll(opts.Paths.EtcDir, 0o700); err != nil {
		return err
	}
	if err := opts.FS.MkdirAll(opts.Paths.OptDir, 0o755); err != nil {
		return err
	}

	var pgDump bytes.Buffer
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		buf := new(bytes.Buffer)
		if _, err := io.Copy(buf, tr); err != nil {
			return err
		}
		switch hdr.Name {
		case "pg_dump.sql":
			pgDump = *buf
		case "master.key":
			if err := opts.FS.WriteFile(opts.Paths.MasterKey, buf.Bytes(), 0o400); err != nil {
				return err
			}
		case "github-app.pem":
			if err := opts.FS.WriteFile(opts.Paths.GitHubKey, buf.Bytes(), 0o400); err != nil {
				return err
			}
		case "docker-compose.yml":
			if err := opts.FS.WriteFile(opts.Paths.ComposeFile, buf.Bytes(), 0o644); err != nil {
				return err
			}
		case ".env":
			if err := opts.FS.WriteFile(opts.Paths.EnvFile, buf.Bytes(), 0o400); err != nil {
				return err
			}
		case ".version":
			if err := opts.FS.WriteFile(opts.Paths.VersionFile, buf.Bytes(), 0o644); err != nil {
				return err
			}
		default:
			fmt.Fprintf(opts.Out, "[restore] skipped unknown entry %s\n", hdr.Name)
		}
	}

	fmt.Fprintf(opts.Out, "[restore] bringing up postgres\n")
	if _, err := opts.Runner.Run(ctx, "docker", []string{
		"compose", "-f", opts.Paths.ComposeFile, "up", "-d", "postgres", "redis",
	}, RunOpts{Stdout: opts.Out, Stderr: opts.Out}); err != nil {
		return err
	}

	fmt.Fprintf(opts.Out, "[restore] piping pg_dump.sql into postgres\n")
	if _, err := opts.Runner.Run(ctx, "docker", []string{
		"compose", "-f", opts.Paths.ComposeFile, "exec", "-T", "postgres",
		"psql", "-U", "projectmng", "-d", "projectmng",
	}, RunOpts{Stdin: &pgDump, Stdout: opts.Out, Stderr: opts.Out}); err != nil {
		return err
	}

	fmt.Fprintf(opts.Out, "[restore] bringing up the rest of the stack\n")
	if _, err := opts.Runner.Run(ctx, "docker", []string{
		"compose", "-f", opts.Paths.ComposeFile, "up", "-d",
	}, RunOpts{Stdout: opts.Out, Stderr: opts.Out}); err != nil {
		return err
	}
	fmt.Fprintln(opts.Out, "[restore] done")
	return nil
}
