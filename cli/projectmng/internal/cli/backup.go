package cli

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

type BackupOpts struct {
	Dest   string // path to write
	Paths  Paths
	Runner CommandRunner
	FS     FS
	Out    io.Writer
}

// Backup produces a tar.gz containing:
//   - pg_dump.sql (logical dump of the projectmng DB)
//   - master.key
//   - github-app.pem
//   - docker-compose.yml
//   - .env
//   - .version
//
// The output is a single self-contained archive; restore reverses the layout.
func Backup(ctx context.Context, opts BackupOpts) error {
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
	if opts.Dest == "" {
		opts.Dest = fmt.Sprintf("projectmng-backup-%s.tar.gz", time.Now().UTC().Format("20060102-150405"))
	}

	fmt.Fprintf(opts.Out, "[backup] dumping postgres → %s\n", opts.Dest)
	dump, err := opts.Runner.Run(ctx, "docker", []string{
		"compose", "-f", opts.Paths.ComposeFile, "exec", "-T", "postgres",
		"pg_dump", "-U", "projectmng", "-d", "projectmng", "--no-owner", "--no-privileges",
	}, RunOpts{})
	if err != nil {
		return fmt.Errorf("pg_dump: %w", err)
	}

	f, err := os.Create(opts.Dest)
	if err != nil {
		return err
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	defer gz.Close()
	tw := tar.NewWriter(gz)
	defer tw.Close()

	add := func(name string, data []byte, mode os.FileMode) error {
		if err := tw.WriteHeader(&tar.Header{
			Name:    name,
			Mode:    int64(mode),
			Size:    int64(len(data)),
			ModTime: time.Now(),
		}); err != nil {
			return err
		}
		_, err := tw.Write(data)
		return err
	}

	if err := add("pg_dump.sql", []byte(dump.Stdout), 0o600); err != nil {
		return err
	}

	for _, item := range []struct {
		name string
		path string
		mode os.FileMode
		opt  bool // tolerate missing
	}{
		{"master.key", opts.Paths.MasterKey, 0o400, false},
		{"github-app.pem", opts.Paths.GitHubKey, 0o400, false},
		{"docker-compose.yml", opts.Paths.ComposeFile, 0o644, false},
		{".env", opts.Paths.EnvFile, 0o400, false},
		{".version", opts.Paths.VersionFile, 0o644, true},
	} {
		data, err := opts.FS.ReadFile(item.path)
		if err != nil {
			if item.opt {
				continue
			}
			return fmt.Errorf("read %s: %w", item.path, err)
		}
		if err := add(item.name, data, item.mode); err != nil {
			return err
		}
	}
	fmt.Fprintf(opts.Out, "[backup] wrote %s\n", opts.Dest)
	return nil
}

// suppress an unused-import warning when no helper-only impls reference strings.
var _ = strings.HasPrefix
