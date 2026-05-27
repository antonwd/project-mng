# Packaging & Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the three buildable apps from Plans 1–3 (`apps/helper`, `apps/api`, `apps/web`) and ship them as a single one-shot install onto a fresh Debian 12 / Ubuntu 24.04 VPS, exactly the way the spec promises in Section 8. End state: the operator runs one signed shell command, opens a printed enrollment URL, registers a passkey, and is in the dashboard.

**Architecture:** A monorepo-level GitHub Actions workflow builds Docker images for `pm-api` and `pm-web` (shared base, multi-stage builds), publishes them to GHCR (public, cosign-signed), builds the `projectmng-helper` binary for `linux/amd64` and `linux/arm64`, and attaches them to a GitHub Release. A signed `install.sh` script reads release metadata (`metadata.json` from the same release) so it always installs a coherent triple of (helper binary, api image, web image) for a specific version. A small Go binary `projectmng` becomes the day-2 CLI for `update`/`backup`/`restore`/`uninstall`.

**Tech stack:** Bash for the installer, Go for the `projectmng` CLI (reuses the helper's stdlib-only patterns), GitHub Actions + `docker buildx` + `cosign` + `goreleaser` (optional) for the release pipeline, Docker Compose v2, systemd for the helper unit, certbot's stock systemd timer for renewals.

**Repo layout added by this plan:**

```
projectMng/
├── apps/                              (Plans 1-3)
├── installer/
│   ├── install.sh                     (the one-shot installer)
│   ├── metadata.schema.json           (validates per-release metadata.json)
│   ├── compose/
│   │   └── docker-compose.yml.tmpl    (rendered at install time)
│   └── nginx/
│       └── pm-dashboard.conf.tmpl     (rendered at install time)
├── cli/
│   └── projectmng/                    (day-2 CLI)
│       ├── go.mod
│       ├── cmd/projectmng/main.go
│       ├── internal/cli/
│       │   ├── update.go
│       │   ├── backup.go
│       │   ├── restore.go
│       │   └── uninstall.go
│       └── Makefile
├── images/
│   ├── api.Dockerfile                 (multi-stage; builds pm-api and pm-worker)
│   └── web.Dockerfile                 (multi-stage; builds Next.js standalone)
└── .github/
    └── workflows/
        ├── ci.yml                     (test on every push)
        └── release.yml                (tag-triggered; builds + publishes)
```

**Conventions:** every commit uses the conventional-commits scope that fits — `installer:`, `cli:`, `ci:`, `images:`. Co-author trailer as before.

---

## Task 1: API Dockerfile

**Files:** Create `images/api.Dockerfile`.

Multi-stage: build TypeScript once, copy `dist/` and `node_modules/` (production-only) into a tiny final image. Same image is used for both `pm-api` and `pm-worker` — `CMD` is overridden by compose.

- [ ] **Step 1: Write the file**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./
RUN npm run build && npm prune --production

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl && rm -rf /var/lib/apt/lists/*
# Install nixpacks
ARG NIXPACKS_VERSION=1.29.0
RUN curl -sSL "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-v${NIXPACKS_VERSION}-amd64.deb" -o /tmp/nixpacks.deb \
    && dpkg -i /tmp/nixpacks.deb && rm /tmp/nixpacks.deb
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/db/migrations ./src/db/migrations
ENV NODE_ENV=production
# Default to pm-api; pm-worker container overrides this.
CMD ["node", "dist/index.api.js"]
```

- [ ] **Step 2: Verify it builds locally**

From repo root:

```bash
docker buildx build -f images/api.Dockerfile -t pm-api:local .
docker run --rm pm-api:local node -e 'console.log("ok")'
```

Expected: build succeeds; container prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add images/api.Dockerfile
git commit -m "images: add api Dockerfile (multi-stage, shared by pm-api and pm-worker)

Includes nixpacks for the deployer's auto-Dockerfile path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Web Dockerfile

**Files:** Create `images/web.Dockerfile`.

Uses Next.js `output: "standalone"` for a tiny runtime image.

- [ ] **Step 1: First, modify `apps/web/next.config.ts`** to enable standalone output:

```ts
import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone" };
export default config;
```

Commit that as: `web: enable Next.js standalone output for container image`.

- [ ] **Step 2: Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Verify**

```bash
docker buildx build -f images/web.Dockerfile -t pm-web:local .
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add images/web.Dockerfile
git commit -m "images: add web Dockerfile (Next.js standalone output)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: docker-compose template

**Files:** Create `installer/compose/docker-compose.yml.tmpl`.

Variables substituted at install time: `${VERSION}`, `${POSTGRES_PASSWORD}`, `${COOKIE_SECRET}`, `${GITHUB_APP_ID}`, `${GITHUB_WEBHOOK_SECRET}`, `${PUBLIC_BASE_URL}`, `${WEBAUTHN_RP_ID}`, `${ACME_EMAIL}`.

- [ ] **Step 1: Write the template**

```yaml
# rendered by installer/install.sh — do not edit by hand
name: projectmng

networks:
  pm_internal:
    driver: bridge

volumes:
  pg_data:
  redis_data:

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: projectmng
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: projectmng
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks: [pm_internal]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U projectmng -d projectmng"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--save", "60", "1"]
    volumes:
      - redis_data:/data
    networks: [pm_internal]

  docker-socket-proxy:
    image: tecnativa/docker-socket-proxy:0.3
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      IMAGES: 1
      BUILD: 1
      NETWORKS: 1
      EXEC: 1
      POST: 1
      VOLUMES: 0
      SWARM: 0
      SYSTEM: 0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [pm_internal]

  pm-api:
    image: ghcr.io/projectmng/api:${VERSION}
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://projectmng:${POSTGRES_PASSWORD}@postgres:5432/projectmng
      REDIS_URL: redis://redis:6379
      MASTER_KEY_PATH: /run/secrets/master.key
      HELPER_SOCKET_PATH: /run/projectmng/helper.sock
      DOCKER_PROXY_URL: http://docker-socket-proxy:2375
      GITHUB_APP_ID: ${GITHUB_APP_ID}
      GITHUB_APP_PRIVATE_KEY_PATH: /run/secrets/github-app.pem
      GITHUB_WEBHOOK_SECRET: ${GITHUB_WEBHOOK_SECRET}
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL}
      WEBAUTHN_RP_ID: ${WEBAUTHN_RP_ID}
      WEBAUTHN_RP_NAME: projectMng
      COOKIE_SECRET: ${COOKIE_SECRET}
      INTERNAL_PORT_MIN: "10000"
      INTERNAL_PORT_MAX: "19999"
      NGINX_MANAGED_DIR: /etc/nginx/sites-enabled/managed
      ACME_EMAIL: ${ACME_EMAIL}
      HTTP_PORT: "3000"
    user: "${PM_UID}:${PM_GID}"
    volumes:
      - /etc/projectmng/master.key:/run/secrets/master.key:ro
      - /etc/projectmng/github-app.pem:/run/secrets/github-app.pem:ro
      - /run/projectmng/helper.sock:/run/projectmng/helper.sock
    ports:
      - "127.0.0.1:3001:3000"
    networks: [pm_internal]
    command: ["node", "dist/index.api.js"]

  pm-worker:
    image: ghcr.io/projectmng/api:${VERSION}
    restart: unless-stopped
    depends_on:
      pm-api: { condition: service_started }
    environment: *pm-api-env-anchor  # see below
    user: "${PM_UID}:${PM_GID}"
    volumes:
      - /etc/projectmng/master.key:/run/secrets/master.key:ro
      - /etc/projectmng/github-app.pem:/run/secrets/github-app.pem:ro
      - /run/projectmng/helper.sock:/run/projectmng/helper.sock
    networks: [pm_internal]
    command: ["node", "dist/index.worker.js"]

  pm-web:
    image: ghcr.io/projectmng/web:${VERSION}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PM_API_URL: http://pm-api:3000
      NEXT_PUBLIC_WEBAUTHN_RP_ID: ${WEBAUTHN_RP_ID}
    ports:
      - "127.0.0.1:3002:3000"
    networks: [pm_internal]
```

(Note: YAML anchors won't work cleanly across services for the env duplication; in the actual template, duplicate the `environment` block for `pm-worker` rather than trying to anchor — keep it simple and explicit. Replace the `*pm-api-env-anchor` reference with a copy of the same env block.)

- [ ] **Step 2: Commit**

```bash
git add installer/compose/docker-compose.yml.tmpl
git commit -m "installer: add docker-compose template with all six services

Pinned image versions via \${VERSION}. Socket proxy allow-lists CONTAINERS,
IMAGES, BUILD, NETWORKS, EXEC, POST only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: nginx dashboard config template

**Files:** Create `installer/nginx/pm-dashboard.conf.tmpl`.

```nginx
# rendered by installer/install.sh — projectMng dashboard site
server {
    listen 80;
    server_name ${PUBLIC_HOSTNAME};

    location /.well-known/acme-challenge/ {
        root /var/www/_acme;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${PUBLIC_HOSTNAME};

    ssl_certificate /etc/letsencrypt/live/${PUBLIC_HOSTNAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PUBLIC_HOSTNAME}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    client_max_body_size 50m;

    # WebSocket + HTTP routes that the browser hits.
    # /api/* WebSocket and HTTP go to pm-api; /api/proxy/* and everything else go to pm-web.
    location /api/deployments/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
    }
    location ~ ^/api/apps/[^/]+/shell$ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 1h;
    }
    location /api/github/webhook {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [ ] **Commit:** `installer: add nginx dashboard config template (WS, webhook, web)`.

---

## Task 5: The `install.sh` script

**Files:** Create `installer/install.sh`.

**Inputs:** `--domain`, `--admin-email`, `--github-app-id`, `--github-app-private-key`, optional `--version` (defaults to "latest stable").

**Steps the script executes (idempotent — safe to re-run):**

1. **Preflight.** Refuse to run if not root. Detect OS (Debian/Ubuntu only). Check that `docker`, `docker compose`, `nginx`, `certbot`, `dig`, `curl`, `openssl` are installed; print install hints and exit if missing.
2. **Resolve version.** If `--version` not provided, fetch `https://api.github.com/repos/projectmng/projectmng/releases/latest` and pick `tag_name`. Then download `metadata.json` for that tag (uploaded as a release asset) — it pins image digests and helper binary checksums.
3. **Create user/group.** `getent group projectmng || groupadd -r projectmng`; same for user. Capture UID/GID.
4. **Provision dirs** (idempotent): `/opt/projectmng`, `/opt/projectmng/data`, `/etc/projectmng`, `/etc/nginx/sites-enabled/managed`, `/var/www/_acme`, `/run/projectmng`. Owner/mode per the spec.
5. **Master key.** If `/etc/projectmng/master.key` does not exist: `head -c32 /dev/urandom > /etc/projectmng/master.key`, chmod 0400, chown projectmng. Print "MASTER KEY GENERATED — back up `/etc/projectmng/master.key` off-host" warning.
6. **GitHub App private key.** Copy from `--github-app-private-key` path to `/etc/projectmng/github-app.pem`, chmod 0400, chown projectmng. Validate it parses as PEM.
7. **Install helper binary.** Download the signed binary for the host arch from the GitHub release; verify SHA-256 against `metadata.json`; verify cosign signature; `install -m 0755` to `/usr/local/bin/projectmng-helper`. Install the systemd unit + tmpfiles snippet (from the helper tarball). `systemctl daemon-reload && systemctl enable --now projectmng-helper`.
8. **Generate secrets.** `POSTGRES_PASSWORD`, `COOKIE_SECRET`, `GITHUB_WEBHOOK_SECRET` (32 bytes each, base64url). Write to `/opt/projectmng/.env` (mode 0400, owner projectmng).
9. **Render `docker-compose.yml`** from `installer/compose/docker-compose.yml.tmpl` into `/opt/projectmng/docker-compose.yml` using `envsubst` with the variables from step 8 plus `--domain`, `--admin-email`, `--github-app-id`, `${VERSION}`, `${PM_UID}`, `${PM_GID}`.
10. **Pull images + start.** `docker compose -f /opt/projectmng/docker-compose.yml pull && docker compose ... up -d`.
11. **Wait for pm-api health** (poll `http://127.0.0.1:3001/healthz` for up to 60s).
12. **Run migrations.** `docker compose exec pm-api npm run db:migrate`.
13. **Render nginx config** for the dashboard hostname using `installer/nginx/pm-dashboard.conf.tmpl` (HTTP-only first, no SSL block yet). Write to `/etc/nginx/sites-enabled/pm-dashboard.conf`. `nginx -t && systemctl reload nginx`.
14. **Issue cert.** `certbot certonly --webroot -w /var/www/_acme -d <domain> -n --agree-tos -m <admin-email>`.
15. **Re-render nginx with HTTPS block** + reload.
16. **Generate the bootstrap enrollment token** by calling `pm-api`'s internal admin endpoint (a one-shot endpoint that's only callable from `127.0.0.1` and only when there are zero users; add this small route in Plan 2 Task 18 / enroll.ts). Capture the printed token.
17. **Print the enrollment URL** and instructions:

```
projectMng is installed.

Open this URL in your browser to register the first admin:
  https://<domain>/enroll/<token>

(The link is single-use and expires in 30 minutes.)

Day-2 commands:
  sudo projectmng update      # pull new images, migrate, restart
  sudo projectmng backup ...  # dump pg + master key + compose file
  sudo projectmng restore ... # restore from a backup
  sudo projectmng uninstall   # stop everything; data optional
```

- [ ] **Commit:** `installer: add install.sh (preflight → users → dirs → keys → helper → compose → nginx → cert → enroll)`.

---

## Task 6: `projectmng` day-2 CLI

**Files:** new Go subtree at `cli/projectmng/`.

Same patterns as Plan 1: stdlib-only, hardened, small. Subcommands:

- `update [--version=v1.2.3]` — read current version from `/opt/projectmng/.version`, fetch new `metadata.json`, verify the helper binary signature, swap helper if changed, `docker compose pull && up -d`, run migrations.
- `backup <dest.tar.gz>` — `pg_dump` (via `docker compose exec`), tar together `pg_data.sql + master.key + github-app.pem + docker-compose.yml + .env`, gzip, encrypt-at-rest if `--age-recipient` is passed.
- `restore <src.tar.gz>` — symmetric inverse; refuses to overwrite an existing install unless `--force`.
- `uninstall [--purge-data]` — `docker compose down`, optionally remove volumes + `/opt/projectmng` + `/etc/projectmng` + `/etc/nginx/sites-enabled/managed/*`.

Each subcommand is a separate file in `internal/cli/`. Tests follow the helper's pattern (in-memory + interface-driven).

- [ ] **Commit per subcommand:** `cli: add projectmng update`, `cli: add projectmng backup`, etc. Final commit: `cli: wire main + Makefile`.

---

## Task 7: CI workflow

**Files:** Create `.github/workflows/ci.yml`.

Runs on every push to any branch:

```yaml
name: CI
on: [push, pull_request]

jobs:
  helper:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.22" }
      - run: cd apps/helper && go test ./...
      - run: cd apps/helper && go build ./...

  api:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm", cache-dependency-path: apps/api/package-lock.json }
      - run: cd apps/api && npm ci
      - run: cd apps/api && npm run typecheck
      - run: cd apps/api && npm test

  web:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm", cache-dependency-path: apps/web/package-lock.json }
      - run: cd apps/web && npm ci
      - run: cd apps/web && npm run build
      - run: cd apps/web && npm test

  cli:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.22" }
      - run: cd cli/projectmng && go test ./...
      - run: cd cli/projectmng && go build ./...
```

- [ ] **Commit:** `ci: add CI workflow (helper, api, web, cli)`.

---

## Task 8: Release workflow

**Files:** Create `.github/workflows/release.yml`.

Triggered on tag `v*.*.*`:

1. Run all CI jobs (matrix-style or reuse).
2. **Build helper binaries** for linux/amd64 + linux/arm64 with reproducible flags (`-trimpath`, `-ldflags="-s -w -buildid="`). Compute SHA-256, sign with cosign keyless.
3. **Build api + web images** with `docker buildx build --platform linux/amd64,linux/arm64 --push --provenance true --sbom true`. Tag as `ghcr.io/projectmng/api:<version>` + `:latest` (only latest for stable releases). Sign with `cosign sign --yes`.
4. **Write `metadata.json`** for the release (`version`, `helper_amd64_sha256`, `helper_arm64_sha256`, `api_image_digest`, `web_image_digest`, `min_compose_version`).
5. **Create GitHub Release** with assets: `projectmng-helper-linux-amd64`, `projectmng-helper-linux-arm64`, `metadata.json`, `install.sh`, `metadata.json.sig`.

- [ ] **Commit:** `ci: add release workflow (multi-arch images, signed helper binaries, metadata)`.

---

## Task 9: Smoke test against a fresh VM

**Files:** Create `installer/test/smoke.sh` + GitHub Actions integration test.

**Approach:** run the installer against a stock Debian 12 container with `docker` and `nginx` preinstalled (a custom test image: `installer/test/Dockerfile.debian-vm` based on `debian:12`). The container runs `systemd` (using `tianon/docker:dind` pattern + `--privileged`). Inside the container:

1. Generate a throwaway GitHub App private key.
2. Run `install.sh --domain pm.test.invalid --admin-email test@test.invalid --github-app-id 1 --github-app-private-key /tmp/key.pem --skip-dns-check --skip-letsencrypt --version <local>` (a few `--skip-*` flags for offline test).
3. Assert: all six containers running; `curl -k https://127.0.0.1 -H "Host: pm.test.invalid"` returns the dashboard HTML (200); enrollment URL was printed.

- [ ] **Commit:** `installer: add smoke test against a containerised Debian VM`.

---

## Task 10: Final wiring + release dry-run

**Files:** root `README.md`, `installer/README.md`, smoke checklist.

- [ ] **Step 1: Root `README.md`** describes the project (one paragraph), points to the spec, and includes the one-line install command:

```
curl -fsSL https://projectmng.example.com/install.sh | sudo bash -s -- \
    --domain pm.example.com \
    --admin-email you@example.com \
    --github-app-id <id> \
    --github-app-private-key /path/to/app.pem
```

- [ ] **Step 2: `installer/README.md`** documents prerequisites, what the installer does step by step (extracted from Task 5), and the day-2 commands.

- [ ] **Step 3: Tag a `v0.1.0` pre-release.** Push the tag. Verify the release workflow runs green, GHCR has the images, the release page has all expected assets.

- [ ] **Step 4: Run the installer** against a real fresh DigitalOcean (or any) droplet end-to-end. Confirm the printed enrollment URL works, you can register a passkey, and you can deploy a tiny sample app (any small Node repo).

- [ ] **Commit:** `installer: v0.1.0 — release-ready`.

---

## Done — what you have at the end of Plan 4

- A single signed shell command installs the whole stack on a fresh Debian/Ubuntu VPS.
- Images live in GHCR with SBOMs + cosign signatures.
- Helper binary lives as a signed GitHub release asset with SHA-256 in `metadata.json`.
- `projectmng update`/`backup`/`restore`/`uninstall` give you full day-2 lifecycle without SSH-managing the stack by hand (only the `projectmng` CLI itself runs at the host).
- CI runs all four subprojects on every push.
- Tag-triggered release builds and signs everything atomically.
- Smoke test against a containerised Debian VM catches install-time regressions.

After Plan 4 ships, the project promises in the spec are fully delivered:

- Connect a GitHub repo, click deploy, get a public HTTPS URL on a custom domain — without ever touching SSH after the initial install.
- Multi-admin auth (passkeys + password+TOTP), encrypted-at-rest secrets, audit log.
- Reversible installation, restorable from backup.
