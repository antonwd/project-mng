# projectMng installer

A single Bash script (`install.sh`) that lays down the whole projectMng stack on a fresh Debian 12 / Ubuntu 24.04 host.

## Prerequisites on the target host

```bash
sudo apt-get update && sudo apt-get install -y \
  docker.io docker-compose-plugin \
  nginx certbot \
  jq bind9-host openssl gettext-base
```

(Docker compose v2 ≥ 2.20 is required.)

## Usage

```bash
sudo install.sh \
  --domain pm.example.com \
  --admin-email you@example.com \
  --github-app-id <id> \
  --github-app-private-key /path/to/app.pem \
  [--version vX.Y.Z]
```

Optional flags:

| flag | effect |
| --- | --- |
| `--version vX.Y.Z` | pin to a specific release tag (defaults to the latest stable) |
| `--skip-dns-check` | skip the `dig` probe (useful in CI / offline) |
| `--skip-letsencrypt` | bring up an HTTP-only nginx config; useful for testing |
| `--local-assets <dir>` | use a locally-built helper binary + metadata.json instead of fetching from a GitHub Release |

## What it does, in order

1. **Preflight.** Refuses to run as non-root. Verifies `docker`, `nginx`, `curl`, `openssl`, `envsubst`, `tar`, `jq`; if `--skip-letsencrypt` isn't set, also `certbot` and `dig`.
2. **Resolve version.** Looks up the GitHub Releases API for the latest tag, or uses the `--version` flag.
3. **Fetch helper binary + metadata.json** for the host's architecture. Verifies SHA-256 against `metadata.json`.
4. **Create the `projectmng` user/group** and the host directory tree (`/opt/projectmng`, `/etc/projectmng`, `/run/projectmng`, `/etc/nginx/sites-enabled/managed`, `/var/www/_acme`).
5. **Generate the master key** at `/etc/projectmng/master.key` (only the first time). Mode 0400, owner `projectmng`. The script prints a warning telling you to back it up — losing it means losing every encrypted secret.
6. **Install the GitHub App private key** at `/etc/projectmng/github-app.pem` (mode 0400). Validates the file parses as PEM-encoded RSA.
7. **Install the helper binary** at `/usr/local/bin/projectmng-helper`, drop the systemd unit, `systemctl enable --now projectmng-helper`.
8. **Generate the per-install secrets** (`POSTGRES_PASSWORD`, `COOKIE_SECRET`, `GITHUB_WEBHOOK_SECRET`) and write `/opt/projectmng/.env` (mode 0400). Re-runs preserve existing secrets — only `VERSION` is updated.
9. **Render `/opt/projectmng/docker-compose.yml`** from `installer/compose/docker-compose.yml.tmpl` via `envsubst`.
10. **`docker compose pull && up -d`** the six services: postgres, redis, docker-socket-proxy, pm-api, pm-worker, pm-web.
11. **Wait for pm-api** (poll up to 60s).
12. **Run database migrations** via `docker compose exec`.
13. **Render the HTTP-only nginx site** so the ACME `webroot` plugin can answer challenges. `nginx -t && systemctl reload nginx`.
14. **Issue the certificate** (`certbot certonly --webroot`).
15. **Re-render the full HTTPS nginx site** from `installer/nginx/pm-dashboard.conf.tmpl`. Reload nginx.
16. **Call `POST /api/admin/bootstrap`** (loopback-only, refuses if any users exist) to produce a single-use enrollment token.
17. **Record `/opt/projectmng/.version`** and print the enrollment URL + the day-2 commands.

The script is idempotent: re-running it preserves the master key, secrets, and cert, and only pulls newer images or updates the version pin.

## Day-2

After install, use `projectmng` (installed alongside) for everything:

| command | what it does |
| --- | --- |
| `sudo projectmng update [--version vX.Y.Z]` | optionally pin a version in `.env`, then `docker compose pull && up -d && exec pm-api npm run db:migrate` |
| `sudo projectmng backup [dest.tar.gz]` | pg_dump + master key + GitHub App PEM + compose + .env + .version into one gzipped tarball |
| `sudo projectmng restore <src.tar.gz> [--force]` | reinstate files, bring postgres up, pipe the dump back in, bring the rest up |
| `sudo projectmng uninstall [--purge-data]` | `docker compose down`; with `--purge-data` also `rm -rf /opt/projectmng /etc/projectmng /etc/nginx/sites-enabled/managed` |

## Smoke test locally

`installer/test/smoke.sh` builds a Debian 12 container image with the host prereqs, then runs `install.sh` inside it against a bound `/var/run/docker.sock`:

```bash
installer/test/smoke.sh
```
