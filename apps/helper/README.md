# projectmng-helper

The privileged root surface for the projectMng platform. A small Go binary that
runs as root via systemd and accepts exactly four commands over a Unix socket:

- `nginx.write_config` — atomically write a managed site config
- `nginx.reload`       — `nginx -t && systemctl reload nginx`
- `certbot.issue`      — issue a Let's Encrypt cert via webroot
- `certbot.renew`      — renew all managed certs and reload nginx

Anything else returns an error. Inputs are strictly validated before reaching
`exec`. All shelled-out commands use absolute paths; `$PATH` is never consulted.

## Building

    make build

## Testing

    make test                  # unit tests (run anywhere)
    make test-integration      # integration tests (Linux + Docker required)

## Installing on a host

    sudo make install
    sudo systemctl daemon-reload
    sudo systemctl enable --now projectmng-helper

Requires a `projectmng` system user/group, an empty
`/etc/nginx/sites-enabled/managed/` directory writable by group `projectmng`,
and `/var/www/_acme/` for the certbot webroot.
