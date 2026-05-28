package cli

import (
	"context"
	"fmt"
	"io"
	"os"
)

type UninstallOpts struct {
	PurgeData bool
	Paths     Paths
	Runner    CommandRunner
	FS        FS
	Out       io.Writer
}

// Uninstall stops the compose stack, optionally removes the data volumes,
// the /opt and /etc trees, and the managed nginx site dir.
//
// It does NOT remove the helper binary, the systemd unit, or app
// containers/volumes started by the deployer — those need manual cleanup
// because they can hold user data.
func Uninstall(ctx context.Context, opts UninstallOpts) error {
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

	down := []string{"compose", "-f", opts.Paths.ComposeFile, "down"}
	if opts.PurgeData {
		down = append(down, "-v")
	}
	fmt.Fprintf(opts.Out, "[uninstall] docker %v\n", down)
	if _, err := opts.Runner.Run(ctx, "docker", down, RunOpts{Stdout: opts.Out, Stderr: opts.Out}); err != nil {
		fmt.Fprintf(opts.Out, "[uninstall] warning: docker compose down failed: %v\n", err)
	}

	if opts.PurgeData {
		for _, p := range []string{opts.Paths.OptDir, opts.Paths.EtcDir, "/etc/nginx/sites-enabled/managed"} {
			fmt.Fprintf(opts.Out, "[uninstall] rm -rf %s\n", p)
			if err := opts.FS.RemoveAll(p); err != nil {
				return fmt.Errorf("rm -rf %s: %w", p, err)
			}
		}
		for _, f := range []string{"/etc/nginx/sites-enabled/pm-dashboard.conf"} {
			fmt.Fprintf(opts.Out, "[uninstall] rm %s\n", f)
			_ = opts.FS.RemoveAll(f)
		}
	} else {
		fmt.Fprintln(opts.Out, "[uninstall] keeping /opt/projectmng + /etc/projectmng (use --purge-data to remove)")
	}
	return nil
}
