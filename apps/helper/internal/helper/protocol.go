// Package helper implements the projectmng-helper Unix-socket protocol
// and command handlers. It is intentionally dependency-free (stdlib only).
package helper

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
)

// MaxPayloadBytes is the largest single request/response payload allowed.
// 1 MiB is comfortably larger than any reasonable nginx site config.
const MaxPayloadBytes = 1 << 20

// MaxStderrBytes caps the stderr captured in error responses so a runaway
// child process can't blow up the wire payload.
const MaxStderrBytes = 4 * 1024

// Request is the wire format for one inbound RPC.
type Request struct {
	Command string          `json:"command"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is the wire format for one outbound RPC reply.
type Response struct {
	OK      bool   `json:"ok"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`   // short code, e.g. "validation_failed"
	Message string `json:"message,omitempty"` // human-readable detail
	Stderr  string `json:"stderr,omitempty"`  // truncated stderr from a child process
}

// SuccessResponse builds an ok response with optional data.
func SuccessResponse(data any) Response {
	return Response{OK: true, Data: data}
}

// ErrorResponse builds a failure response, truncating stderr if needed.
func ErrorResponse(code, message, stderr string) Response {
	if len(stderr) > MaxStderrBytes {
		const marker = "…[truncated]"
		keep := MaxStderrBytes - len(marker)
		if keep < 0 {
			keep = 0
		}
		stderr = stderr[:keep] + marker
	}
	return Response{OK: false, Error: code, Message: message, Stderr: stderr}
}

// WriteFrame writes a length-prefixed payload to w.
func WriteFrame(w io.Writer, payload []byte) error {
	if len(payload) > MaxPayloadBytes {
		return fmt.Errorf("payload too large: %d > %d", len(payload), MaxPayloadBytes)
	}
	var hdr [4]byte
	binary.BigEndian.PutUint32(hdr[:], uint32(len(payload)))
	if _, err := w.Write(hdr[:]); err != nil {
		return err
	}
	if _, err := w.Write(payload); err != nil {
		return err
	}
	return nil
}

// ReadFrame reads a length-prefixed payload from r. Returns an error if the
// declared length exceeds MaxPayloadBytes.
func ReadFrame(r io.Reader) ([]byte, error) {
	var hdr [4]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return nil, err
	}
	length := binary.BigEndian.Uint32(hdr[:])
	if length > MaxPayloadBytes {
		return nil, fmt.Errorf("payload too large: %d > %d", length, MaxPayloadBytes)
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}
