package helper

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// AtomicWriter writes a file in a way that's either fully visible or not at
// all — readers never see a half-written file.
type AtomicWriter interface {
	WriteAtomic(path string, content []byte, mode os.FileMode) error
}

var errPathNotAbsolute = errors.New("path must be absolute")

// RealWriter writes to the real filesystem using temp-file + rename.
type RealWriter struct{}

func (RealWriter) WriteAtomic(path string, content []byte, mode os.FileMode) error {
	if !filepath.IsAbs(path) {
		return errPathNotAbsolute
	}
	dir := filepath.Dir(path)
	base := filepath.Base(path)
	tmp, err := os.CreateTemp(dir, "."+base+".tmp.*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpName := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpName) }
	if _, err := tmp.Write(content); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("write temp: %w", err)
	}
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("chmod temp: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("fsync temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return fmt.Errorf("close temp: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		cleanup()
		return fmt.Errorf("rename: %w", err)
	}
	return nil
}

// MemoryWriter records writes in a map for tests.
type MemoryWriter struct {
	Files map[string][]byte
	Modes map[string]os.FileMode
}

// NewMemoryWriter returns an initialized MemoryWriter.
func NewMemoryWriter() *MemoryWriter {
	return &MemoryWriter{
		Files: map[string][]byte{},
		Modes: map[string]os.FileMode{},
	}
}

func (m *MemoryWriter) WriteAtomic(path string, content []byte, mode os.FileMode) error {
	cp := make([]byte, len(content))
	copy(cp, content)
	m.Files[path] = cp
	m.Modes[path] = mode
	return nil
}
