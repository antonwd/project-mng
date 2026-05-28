package cli

import (
	"bytes"
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

// inMemFS is a minimal FS over a real temp dir; keeps the surface small.
type tempFS struct{ root string }

func (t tempFS) Stat(name string) (os.FileInfo, error) { return os.Stat(t.path(name)) }
func (t tempFS) ReadFile(name string) ([]byte, error)  { return os.ReadFile(t.path(name)) }
func (t tempFS) WriteFile(name string, data []byte, p os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(t.path(name)), 0o755); err != nil {
		return err
	}
	return os.WriteFile(t.path(name), data, p)
}
func (t tempFS) RemoveAll(name string) error { return os.RemoveAll(t.path(name)) }
func (t tempFS) MkdirAll(name string, p fs.FileMode) error {
	return os.MkdirAll(t.path(name), p)
}
func (t tempFS) path(name string) string { return filepath.Join(t.root, name) }

func TestUpdateRewritesVersionAndShellsOutDockerCompose(t *testing.T) {
	dir := t.TempDir()
	envPath := filepath.Join(dir, ".env")
	composePath := filepath.Join(dir, "docker-compose.yml")
	versionPath := filepath.Join(dir, ".version")
	if err := os.WriteFile(envPath, []byte("VERSION=v0.0.1\nFOO=bar\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runner := &FakeRunner{}
	var buf bytes.Buffer
	err := Update(context.Background(), UpdateOpts{
		WantVersion: "v1.2.3",
		Paths: Paths{
			OptDir:      dir,
			ComposeFile: composePath,
			EnvFile:     envPath,
			VersionFile: versionPath,
		},
		Runner: runner,
		FS:     RealFS{},
		Out:    &buf,
	})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	got, _ := os.ReadFile(envPath)
	if !bytes.Contains(got, []byte("VERSION=v1.2.3")) {
		t.Fatalf(".env not rewritten: %s", got)
	}
	if !bytes.Contains(got, []byte("FOO=bar")) {
		t.Fatalf("other env keys lost: %s", got)
	}
	if len(runner.Calls) != 3 {
		t.Fatalf("expected 3 docker calls, got %d (%+v)", len(runner.Calls), runner.Calls)
	}
	versionFileData, _ := os.ReadFile(versionPath)
	if !bytes.Contains(versionFileData, []byte("v1.2.3")) {
		t.Fatalf(".version not written: %q", versionFileData)
	}
}

func TestRestoreRefusesOverExistingInstall(t *testing.T) {
	dir := t.TempDir()
	master := filepath.Join(dir, "master.key")
	if err := os.WriteFile(master, []byte("existing"), 0o400); err != nil {
		t.Fatal(err)
	}
	err := Restore(context.Background(), RestoreOpts{
		Src: filepath.Join(dir, "missing.tar.gz"),
		Paths: Paths{
			EtcDir:    dir,
			MasterKey: master,
		},
		Runner: &FakeRunner{},
		FS:     RealFS{},
	})
	if err == nil {
		t.Fatal("expected refusal, got nil")
	}
}

func TestUninstallCallsDockerComposeDown(t *testing.T) {
	dir := t.TempDir()
	runner := &FakeRunner{}
	err := Uninstall(context.Background(), UninstallOpts{
		PurgeData: false,
		Paths: Paths{
			OptDir:      dir,
			ComposeFile: filepath.Join(dir, "docker-compose.yml"),
		},
		Runner: runner,
		FS:     tempFS{root: dir},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(runner.Calls) != 1 || runner.Calls[0].Args[0] != "compose" {
		t.Fatalf("expected single docker compose call, got %+v", runner.Calls)
	}
}
