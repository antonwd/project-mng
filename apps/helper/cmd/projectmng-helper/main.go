// projectmng-helper runs as root via systemd and exposes a Unix-socket
// JSON-RPC API with four allow-listed commands. See the package README.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"strconv"
	"syscall"

	"github.com/projectmng/projectmng/apps/helper/internal/helper"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{}))
	slog.SetDefault(logger)

	if err := run(logger); err != nil {
		logger.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func envOr(key, dflt string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return dflt
}

func run(logger *slog.Logger) error {
	cfg := helper.Config{
		NginxBin:       envOr("PROJECTMNG_NGINX_BIN", "/usr/sbin/nginx"),
		SystemctlBin:   envOr("PROJECTMNG_SYSTEMCTL_BIN", "/bin/systemctl"),
		CertbotBin:     envOr("PROJECTMNG_CERTBOT_BIN", "/usr/bin/certbot"),
		NginxConfigDir: envOr("PROJECTMNG_NGINX_CONFIG_DIR", "/etc/nginx/sites-enabled/managed"),
		AcmeWebroot:    envOr("PROJECTMNG_ACME_WEBROOT", "/var/www/_acme"),
	}
	socketPath := envOr("PROJECTMNG_SOCKET_PATH", "/run/projectmng/helper.sock")
	socketGroup := envOr("PROJECTMNG_SOCKET_GROUP", "projectmng")

	if err := os.MkdirAll(filepath.Dir(socketPath), 0o755); err != nil {
		return err
	}
	if err := os.RemoveAll(socketPath); err != nil {
		return err
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return err
	}
	defer listener.Close()
	if err := os.Chmod(socketPath, 0o660); err != nil {
		return err
	}
	if socketGroup != "" {
		gid, err := lookupGID(socketGroup)
		if err != nil {
			return err
		}
		if err := os.Chown(socketPath, -1, gid); err != nil {
			return err
		}
	}

	handlers := &helper.Handlers{
		Cfg:    cfg,
		Runner: &helper.RealRunner{},
		Writer: helper.RealWriter{},
	}
	srv := &helper.Server{Handlers: handlers, Log: logger}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info("listening", "socket", socketPath)
	err = srv.Serve(ctx, listener)
	if err != nil && !errors.Is(err, context.Canceled) && !errors.Is(err, net.ErrClosed) {
		return err
	}
	logger.Info("shutdown complete")
	return nil
}

func lookupGID(group string) (int, error) {
	g, err := user.LookupGroup(group)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(g.Gid)
}
