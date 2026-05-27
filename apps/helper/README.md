# projectmng-helper

The privileged root surface for the projectMng platform. A small Go binary
(stdlib only) that runs as root via systemd and accepts exactly four commands
over a Unix socket:

| Command              | Params                                   | What it does |
|----------------------|------------------------------------------|--------------|
| `nginx.write_config` | `{"name": "<slug>", "content": "..."}`   | Atomically writes `<ConfigDir>/<slug>.conf` (mode 0640). Does **not** reload. |
| `nginx.reload`       | (none)                                   | Runs `nginx -t`, then `systemctl reload nginx`. Validates first; refuses to reload a broken config. |
| `certbot.issue`      | `{"domain": "...", "email": "..."}`      | Runs `certbot certonly --webroot -w <AcmeWebroot> -d <domain> -n --agree-tos --email <email>`. 120s timeout. |
| `certbot.renew`      | (none)                                   | Runs `certbot renew --webroot -w <AcmeWebroot> -n --no-random-sleep-on-renew`. 300s timeout. |

Anything else returns `{"ok": false, "error": "unknown_command", ...}`. Inputs
are strictly validated before reaching `exec`. All shelled-out commands use
absolute paths; `$PATH` is never consulted; child processes inherit an empty
environment.

## Wire protocol

One request per connection. 4-byte big-endian uint32 length prefix, then a
JSON payload. Max payload 1 MiB. Server closes the connection after
responding. See `internal/helper/protocol.go` for the exact types.

## Configuration

All paths are overridable via env vars; defaults match the Debian/Ubuntu
package layout:

| Env var | Default |
|---------|---------|
| `PROJECTMNG_SOCKET_PATH`     | `/run/projectmng/helper.sock` |
| `PROJECTMNG_SOCKET_GROUP`    | `projectmng` (set explicitly to empty string to skip chown) |
| `PROJECTMNG_NGINX_BIN`       | `/usr/sbin/nginx` |
| `PROJECTMNG_SYSTEMCTL_BIN`   | `/bin/systemctl` |
| `PROJECTMNG_CERTBOT_BIN`     | `/usr/bin/certbot` |
| `PROJECTMNG_NGINX_CONFIG_DIR`| `/etc/nginx/sites-enabled/managed` |
| `PROJECTMNG_ACME_WEBROOT`    | `/var/www/_acme` |

## Building

```
make build           # produces bin/projectmng-helper and bin/projectmng-helper-cli
```

## Testing

```
make test                # unit tests (anywhere)
make test-integration    # integration tests (Linux + Docker; mostly skipped in v1)
```

## Installing on a host

```
sudo make install
sudo systemd-tmpfiles --create /usr/lib/tmpfiles.d/projectmng-helper.conf
sudo systemctl daemon-reload
sudo systemctl enable --now projectmng-helper
```

Prerequisites:

- A `projectmng` system user/group: `sudo groupadd -r projectmng && sudo useradd -r -g projectmng -s /usr/sbin/nologin projectmng`
- An empty managed config dir, root-owned, group `projectmng`, group-writable: `sudo install -d -o root -g projectmng -m 2770 /etc/nginx/sites-enabled/managed`
- The certbot webroot: `sudo install -d -o root -g root -m 0755 /var/www/_acme`
- nginx and certbot installed (`apt install nginx certbot`)
- nginx's `http {}` block includes `include /etc/nginx/sites-enabled/managed/*.conf;`

## Debug CLI

```
projectmng-helper-cli nginx.reload
projectmng-helper-cli nginx.write_config '{"name":"hello","content":"server { listen 127.0.0.1:10000; return 200; }"}'
```

## Security notes

- The helper is the only root surface the platform trusts. The full source is
  ~600 LOC (including tests) and dependency-free, so it is auditable in a
  single sitting.
- `RealRunner` refuses any binary name that isn't an absolute path and runs
  children with an empty `env`. There is no `$PATH` lookup, ever.
- `nginx.reload` always runs `nginx -t` first and bails out on failure, so a
  caller can't crash the nginx master with a broken managed config.
- The systemd unit uses `ProtectSystem=strict` with a small `ReadWritePaths`
  whitelist, an empty capability bounding set, `NoNewPrivileges=yes`, and
  several other hardening knobs. See `systemd/projectmng-helper.service`.
