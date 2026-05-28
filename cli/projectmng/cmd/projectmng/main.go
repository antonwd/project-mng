package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/projectmng/projectmng/cli/projectmng/internal/cli"
)

const helpText = `projectmng — day-2 lifecycle for projectMng installations

Subcommands:
  update   [--version vX.Y.Z]            pull new images, migrate, restart
  backup   <dest.tar.gz>                 dump pg + keys + compose into a tarball
  restore  <src.tar.gz> [--force]        re-hydrate an install from a backup
  uninstall [--purge-data]               docker compose down, optionally rm -rf data
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, helpText)
		os.Exit(64)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	paths := cli.LoadPathsFromEnv()

	switch os.Args[1] {
	case "update":
		fs := flag.NewFlagSet("update", flag.ExitOnError)
		version := fs.String("version", "", "pin to this version (defaults to whatever .env already has)")
		_ = fs.Parse(os.Args[2:])
		if err := cli.Update(ctx, cli.UpdateOpts{
			WantVersion: *version,
			Paths:       paths,
		}); err != nil {
			fatal(err)
		}
	case "backup":
		fs := flag.NewFlagSet("backup", flag.ExitOnError)
		_ = fs.Parse(os.Args[2:])
		dest := ""
		if fs.NArg() > 0 {
			dest = fs.Arg(0)
		}
		if err := cli.Backup(ctx, cli.BackupOpts{Dest: dest, Paths: paths}); err != nil {
			fatal(err)
		}
	case "restore":
		fs := flag.NewFlagSet("restore", flag.ExitOnError)
		force := fs.Bool("force", false, "overwrite an existing install")
		_ = fs.Parse(os.Args[2:])
		if fs.NArg() < 1 {
			fmt.Fprintln(os.Stderr, "restore: need <src.tar.gz>")
			os.Exit(64)
		}
		if err := cli.Restore(ctx, cli.RestoreOpts{Src: fs.Arg(0), Force: *force, Paths: paths}); err != nil {
			fatal(err)
		}
	case "uninstall":
		fs := flag.NewFlagSet("uninstall", flag.ExitOnError)
		purge := fs.Bool("purge-data", false, "remove /opt and /etc trees as well")
		_ = fs.Parse(os.Args[2:])
		if err := cli.Uninstall(ctx, cli.UninstallOpts{PurgeData: *purge, Paths: paths}); err != nil {
			fatal(err)
		}
	case "-h", "--help", "help":
		fmt.Print(helpText)
	default:
		fmt.Fprintf(os.Stderr, "unknown subcommand %q\n%s", os.Args[1], helpText)
		os.Exit(64)
	}
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "projectmng: %v\n", err)
	os.Exit(1)
}
