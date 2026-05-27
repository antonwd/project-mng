package helper

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestMemoryWriter_RecordsWrites(t *testing.T) {
	mw := NewMemoryWriter()
	if err := mw.WriteAtomic("/etc/nginx/managed/a.conf", []byte("server {}"), 0o644); err != nil {
		t.Fatalf("WriteAtomic: %v", err)
	}
	got, ok := mw.Files["/etc/nginx/managed/a.conf"]
	if !ok || string(got) != "server {}" {
		t.Fatalf("missing or wrong content: ok=%v got=%q", ok, got)
	}
}

func TestRealWriter_WritesAndRenamesAtomically(t *testing.T) {
	dir := t.TempDir()
	rw := &RealWriter{}
	target := filepath.Join(dir, "out.conf")
	if err := rw.WriteAtomic(target, []byte("hello"), 0o640); err != nil {
		t.Fatalf("WriteAtomic: %v", err)
	}
	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != "hello" {
		t.Fatalf("content mismatch: %q", got)
	}
	st, err := os.Stat(target)
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if st.Mode().Perm() != 0o640 {
		t.Fatalf("mode mismatch: got %o want 0640", st.Mode().Perm())
	}
	// Temp file should not be left behind.
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("expected 1 file, got %d", len(entries))
	}
}

func TestRealWriter_RefusesRelativePath(t *testing.T) {
	rw := &RealWriter{}
	err := rw.WriteAtomic("relative.conf", []byte("x"), 0o644)
	if err == nil || !errors.Is(err, errPathNotAbsolute) {
		t.Fatalf("expected errPathNotAbsolute, got %v", err)
	}
}
