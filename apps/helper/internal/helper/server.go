package helper

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"time"
)

// Server is the helper's accept loop.
type Server struct {
	Handlers     *Handlers
	ReadTimeout  time.Duration // default 30s
	WriteTimeout time.Duration // default 5s
	Log          *slog.Logger  // optional; defaults to slog.Default()
}

// Serve runs the accept loop until ctx is cancelled or listener closes.
func (s *Server) Serve(ctx context.Context, l net.Listener) error {
	readTO := s.ReadTimeout
	if readTO == 0 {
		readTO = 30 * time.Second
	}
	writeTO := s.WriteTimeout
	if writeTO == 0 {
		writeTO = 5 * time.Second
	}
	logger := s.Log
	if logger == nil {
		logger = slog.Default()
	}

	// Close the listener on ctx.Done so Accept unblocks.
	go func() {
		<-ctx.Done()
		_ = l.Close()
	}()

	for {
		conn, err := l.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) || ctx.Err() != nil {
				return ctx.Err()
			}
			logger.Warn("accept error", "err", err)
			continue
		}
		go s.handle(ctx, conn, readTO, writeTO, logger)
	}
}

func (s *Server) handle(ctx context.Context, conn net.Conn, readTO, writeTO time.Duration, logger *slog.Logger) {
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(readTO))
	payload, err := ReadFrame(conn)
	if err != nil {
		logger.Info("read frame failed", "err", err)
		return
	}
	var req Request
	resp := s.dispatch(ctx, payload, &req)
	_ = conn.SetWriteDeadline(time.Now().Add(writeTO))
	out, err := json.Marshal(resp)
	if err != nil {
		logger.Error("marshal response failed", "err", err)
		return
	}
	if err := WriteFrame(conn, out); err != nil {
		logger.Info("write frame failed", "err", err, "command", req.Command)
		return
	}
	logger.Info("handled", "command", req.Command, "ok", resp.OK, "error", resp.Error)
}

func (s *Server) dispatch(ctx context.Context, payload []byte, req *Request) Response {
	if err := json.Unmarshal(payload, req); err != nil {
		return ErrorResponse("bad_request", "request not valid JSON", err.Error())
	}
	switch req.Command {
	case "nginx.write_config":
		return s.Handlers.NginxWriteConfig(ctx, req.Params)
	case "nginx.reload":
		return s.Handlers.NginxReload(ctx)
	case "certbot.issue":
		return s.Handlers.CertbotIssue(ctx, req.Params)
	case "certbot.renew":
		return s.Handlers.CertbotRenew(ctx)
	default:
		return ErrorResponse("unknown_command", "command not recognised: "+req.Command, "")
	}
}
