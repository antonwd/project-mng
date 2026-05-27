package helper

import (
	"context"
	"encoding/json"
	"net"
	"sync"
	"testing"
	"time"
)

// inMemListener exposes a net.Listener whose connections come from net.Pipe.
type inMemListener struct {
	ch     chan net.Conn
	closed chan struct{}
	once   sync.Once
}

func newInMemListener() *inMemListener {
	return &inMemListener{ch: make(chan net.Conn), closed: make(chan struct{})}
}

func (l *inMemListener) Accept() (net.Conn, error) {
	select {
	case c := <-l.ch:
		return c, nil
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

func (l *inMemListener) Close() error {
	l.once.Do(func() { close(l.closed) })
	return nil
}

func (l *inMemListener) Addr() net.Addr { return &net.UnixAddr{Name: "memory", Net: "unix"} }

func (l *inMemListener) Dial() net.Conn {
	clientSide, serverSide := net.Pipe()
	l.ch <- serverSide
	return clientSide
}

func runRoundTrip(t *testing.T, listener *inMemListener, req Request) Response {
	t.Helper()
	conn := listener.Dial()
	defer conn.Close()
	payload, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal req: %v", err)
	}
	if err := WriteFrame(conn, payload); err != nil {
		t.Fatalf("WriteFrame: %v", err)
	}
	respBytes, err := ReadFrame(conn)
	if err != nil {
		t.Fatalf("ReadFrame: %v", err)
	}
	var resp Response
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		t.Fatalf("unmarshal resp: %v", err)
	}
	return resp
}

func TestServer_DispatchesNginxReload(t *testing.T) {
	runner := &FakeRunner{Responses: []FakeResponse{{ExitCode: 0}, {ExitCode: 0}}}
	h := &Handlers{
		Cfg:    Config{NginxBin: "/usr/sbin/nginx", SystemctlBin: "/bin/systemctl"},
		Runner: runner,
	}
	srv := &Server{Handlers: h}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- srv.Serve(ctx, listener) }()

	resp := runRoundTrip(t, listener, Request{Command: "nginx.reload"})
	if !resp.OK {
		t.Fatalf("expected ok, got %+v", resp)
	}

	cancel()
	if err := <-done; err != nil && err != context.Canceled && err != net.ErrClosed {
		t.Fatalf("Serve returned unexpected error: %v", err)
	}
}

func TestServer_UnknownCommand(t *testing.T) {
	h := &Handlers{Cfg: Config{}, Runner: &FakeRunner{}}
	srv := &Server{Handlers: h}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.Serve(ctx, listener)

	resp := runRoundTrip(t, listener, Request{Command: "doom.activate"})
	if resp.OK || resp.Error != "unknown_command" {
		t.Fatalf("expected unknown_command, got %+v", resp)
	}
}

func TestServer_BadJSONInFrame(t *testing.T) {
	srv := &Server{Handlers: &Handlers{Cfg: Config{}, Runner: &FakeRunner{}}}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.Serve(ctx, listener)

	conn := listener.Dial()
	defer conn.Close()
	if err := WriteFrame(conn, []byte("not json")); err != nil {
		t.Fatalf("WriteFrame: %v", err)
	}
	respBytes, err := ReadFrame(conn)
	if err != nil {
		t.Fatalf("ReadFrame: %v", err)
	}
	var resp Response
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		t.Fatalf("unmarshal resp: %v", err)
	}
	if resp.OK || resp.Error != "bad_request" {
		t.Fatalf("expected bad_request, got %+v", resp)
	}
}

func TestServer_ReadDeadlineFires(t *testing.T) {
	srv := &Server{
		Handlers:    &Handlers{Cfg: Config{}, Runner: &FakeRunner{}},
		ReadTimeout: 50 * time.Millisecond,
	}
	listener := newInMemListener()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go srv.Serve(ctx, listener)

	conn := listener.Dial()
	defer conn.Close()
	// Never send anything; server should give up and close.
	buf := make([]byte, 1)
	conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, err := conn.Read(buf)
	if err == nil {
		t.Fatal("expected the server-side to close, got read success")
	}
}
