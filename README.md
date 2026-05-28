# projectMng

Self-hosted mini-Vercel for a single VPS. Connect a GitHub repo, click deploy, get a public HTTPS URL on a custom domain — without ever SSHing to the host after the initial install.

## Install (one-shot)

On a fresh Debian 12 or Ubuntu 24.04 host (with Docker, nginx, and certbot pre-installed):

```bash
curl -fsSL https://github.com/projectmng/projectmng/releases/latest/download/install.sh \
  | sudo bash -s -- \
    --domain pm.example.com \
    --admin-email you@example.com \
    --github-app-id <id> \
    --github-app-private-key /path/to/app.pem
```

The script generates a master key, drops it into `/etc/projectmng/master.key` (back this up!), pulls the signed images from GHCR, brings the stack up with docker compose, issues a Let's Encrypt cert, and prints a single-use enrollment URL. Open it, register a passkey, and you're in.

## What's in the box

- **pm-api** (Node 20 + Fastify + Drizzle + Postgres + Redis): GitHub App integration, encrypted-at-rest env vars, passkey + password+TOTP auth, audit log.
- **pm-worker** (same image): BullMQ workers that clone + build (Nixpacks or your own Dockerfile) + swap container + reload nginx.
- **pm-web** (Next.js 16): the dashboard. Server components + server actions. xterm.js shell, live deployment logs over WebSocket.
- **projectmng-helper** (Go, stdlib-only): a host-side daemon that mediates the four privileged operations (`nginx.write_config`, `nginx.reload`, `certbot.issue`, `certbot.renew`) over a Unix socket — pm-api never runs as root and never touches `/etc/nginx` or certbot directly.
- **projectmng** (Go CLI): `update`, `backup`, `restore`, `uninstall`. The only command you should need to run on the host after install.

## Day-2

```bash
sudo projectmng update                            # pull new images, migrate, restart
sudo projectmng backup ./backup-$(date -I).tar.gz # pg dump + master key + compose
sudo projectmng restore ./backup-2026-05-28.tar.gz
sudo projectmng uninstall --purge-data            # docker compose down + rm -rf data
```

## Architecture

See [`docs/superpowers/specs/2026-05-27-projectmng-design.md`](docs/superpowers/specs/2026-05-27-projectmng-design.md) for the full design. The four implementation plans:

- [`docs/superpowers/plans/2026-05-27-host-helper.md`](docs/superpowers/plans/2026-05-27-host-helper.md) — `apps/helper`
- [`docs/superpowers/plans/2026-05-27-platform-core.md`](docs/superpowers/plans/2026-05-27-platform-core.md) — `apps/api`
- [`docs/superpowers/plans/2026-05-27-dashboard.md`](docs/superpowers/plans/2026-05-27-dashboard.md) — `apps/web`
- [`docs/superpowers/plans/2026-05-27-packaging.md`](docs/superpowers/plans/2026-05-27-packaging.md) — this directory's installer + CLI + CI

## Repo layout

```
apps/
├── helper/           Go host-side daemon (nginx + certbot proxy)
├── api/              pm-api + pm-worker (Node, Fastify, Drizzle)
└── web/              pm-web (Next.js 16, App Router)
cli/
└── projectmng/       Day-2 CLI (update/backup/restore/uninstall)
images/
├── api.Dockerfile    Shared image for pm-api + pm-worker
└── web.Dockerfile    Next.js standalone runtime
installer/
├── install.sh        One-shot installer
├── compose/          docker-compose.yml.tmpl
├── nginx/            pm-dashboard.conf.tmpl
└── test/             Containerised smoke test
.github/
└── workflows/        CI + Release workflows
```

## License

Source-available; pick a license before tagging v0.1.0.
