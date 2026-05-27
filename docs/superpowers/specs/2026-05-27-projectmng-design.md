# projectMng — Design Spec

**Date:** 2026-05-27
**Status:** Draft, pending implementation plan
**Author:** Anton (with Claude)

## 1. Purpose

A self-hosted mini-Vercel for a single VPS. Connect a GitHub repo, click deploy, get a public HTTPS URL on a custom domain. Manage all apps, domains, and nginx configuration from a web dashboard so routine ops no longer require SSH.

## 2. Goals & Non-Goals

### Goals
- One-click deploys of Node/Next.js apps (and anything else Nixpacks can build) from connected GitHub repos.
- Auto-generate Dockerfiles via Nixpacks; respect a repo's own `Dockerfile` when present.
- Manage nginx site configs and Let's Encrypt certificates on the host without SSH.
- Zero-downtime blue/green deploys with instant rollback to any prior successful deployment.
- Strong security posture: privilege separation, encrypted-at-rest secrets, audit log, phishing-resistant auth.
- Small team support (multiple admins, all equal) with secure invite flow.
- Coexist with the user's pre-existing hand-written nginx sites — do not touch them.

### Non-Goals (v1)
- PR / preview deployments (architectural room left, but not built).
- Multi-host fleets, multi-region.
- Managed databases as a service.
- Build-time secrets (build args).
- Fine-grained roles / RBAC.
- Defending against malicious admin users.
- Defending against malicious user apps escaping Docker.
- Network-layer DDoS protection (use Cloudflare upstream if needed).

## 3. Key Decisions (locked in during brainstorming)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Docker-only runtime | Uniform lifecycle, strong isolation, resource limits, easy cleanup. |
| 2 | Nixpacks for auto-build; `Dockerfile` overrides if present | Mature, MIT-licensed, handles Next.js/Node/Bun/Python/static out of the box. |
| 3 | Small trusted team, all admins (no RBAC) | Matches actual scale; avoids premature RBAC complexity. |
| 4 | GitHub App for repo integration | Short-lived clone tokens, webhooks, commit-status posting, no long-lived secrets. |
| 5 | Manual deploy by default; auto-deploy opt-in per app; one-click redeploy & rollback | Predictability over surprise restarts. |
| 6 | nginx stays as host service; platform owns `/etc/nginx/sites-enabled/managed/` only | Pre-existing sites untouched, easy adoption, easy rollback. |
| 7 | Let's Encrypt via certbot (`certonly --webroot`) | Standard, well-understood, integrates with host nginx. |
| 8 | Docker Socket Proxy (tecnativa) — never direct socket access from app code | Limits blast radius of a platform-side RCE. |
| 9 | Node.js + TypeScript + Fastify (API/worker), Next.js + Tailwind + shadcn/ui (web), Postgres, Redis, BullMQ, Drizzle | Familiar stack for the user; platform deploys itself. |
| 10 | Passkeys (WebAuthn) and password + TOTP, user picks; passkey-only allowed, password-only is not | Phishing-resistant by default; classic fallback for compatibility. |

## 4. Architecture

### 4.1 Host topology

The platform runs as six containers on a single VPS. nginx remains a system service (not containerized) so existing hand-written sites continue to serve. App containers run on per-app isolated Docker networks; the platform's own containers run on a separate internal network.

```
┌─────────────────────────────────────────────────────────────────┐
│  VPS (single host)                                              │
│                                                                  │
│  ┌──────────┐                                                   │
│  │  nginx   │ ◄── system service, listens :80 / :443            │
│  │ (host)   │     reads /etc/nginx/sites-enabled/managed/       │
│  └─────┬────┘     (platform-owned dir)                          │
│        │ proxies to 127.0.0.1:<port>                            │
│        ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Docker network: pm_internal                            │   │
│  │  pm-api · pm-web · pm-worker · postgres · redis ·       │   │
│  │  docker-socket-proxy                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Per-app Docker networks: app_<id>                      │   │
│  │  Each user app container bound to 127.0.0.1:<port>      │   │
│  │  (never 0.0.0.0)                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Host helper: /usr/local/bin/projectmng-helper (systemd, root)  │
│  Unix socket /run/projectmng/helper.sock (group: projectmng)    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Components

| Component | Image | Role | Privileges |
|-----------|-------|------|------------|
| **pm-web** | `projectmng/web:<ver>` | Next.js App Router dashboard (server components + server actions) | None — no DB, no Docker, no host. Calls pm-api over `pm_internal`. |
| **pm-api** | `projectmng/api:<ver>` | Fastify HTTP API + WebSocket for live logs | DB connection (scoped Postgres role), socket-proxy client, helper socket client, master key + GitHub App private key (read-only mounts). |
| **pm-worker** | `projectmng/api:<ver>` (same image, different command) | BullMQ worker for clone/build/swap/cert jobs | Same as pm-api, plus access to the build volume. |
| **docker-socket-proxy** | `tecnativa/docker-socket-proxy:<ver>` | Allow-listed proxy to `/var/run/docker.sock` | Mounts the real Docker socket; exposes only `CONTAINERS`, `IMAGES`, `BUILD`, `NETWORKS`, `EXEC` with `POST=1`. All admin/swarm/volumes/system endpoints denied. |
| **postgres** | `postgres:16-alpine` | Platform state | App schema only; revoked DDL on production role. |
| **redis** | `redis:7-alpine` | BullMQ queue + pub/sub for log streaming | Internal network only. |
| **host-helper** | Single Go binary, ~200 LOC | Privileged operations on the host | Root, but accepts only 4 commands over Unix socket: `nginx.write_config`, `nginx.reload`, `certbot.issue`, `certbot.renew`. |

### 4.3 Networking

- Public exposure (firewall, UFW): **22, 80, 443 only**.
- All platform containers bind to `127.0.0.1` or to internal Docker networks.
- User app containers bind to `127.0.0.1:<assigned-port>` on the host. nginx is the only public ingress.
- Per-app Docker networks prevent app-to-app discovery on the Docker bridge.
- Internal port pool: **10000–19999**, allocated by the DB (unique constraint), persistent per app for the app's lifetime.

## 5. Security Model

### 5.1 Trust tiers
- **pm-web** — read-only proxy to pm-api. Compromise reveals only what the logged-in session can see.
- **pm-api / pm-worker** — can deploy/stop containers (via socket-proxy allow-list), can request nginx config writes + reloads (via helper allow-list), can read encrypted secrets (needs master key in memory at deploy time to decrypt).
- **host-helper** — root, but executes only the four whitelisted operations. Source is small enough to audit in one sitting.

### 5.2 Secrets at rest
- Per-app env vars encrypted with **AES-256-GCM** (unique nonce per value).
- **Data-encryption key (DEK)** is 32 random bytes at `/etc/projectmng/master.key`, mode `0400`, owned by `projectmng`. Bind-mounted read-only into pm-api and pm-worker.
- DEK is never in the database, env vars, logs, or Git.
- At deploy time, decrypted values are written to a tmpfs file inside the container and passed via `--env-file`. The file is removed when the container is stopped.
- A `master.key.backup.age` encrypted to the operator's personal passkey (or a paper recovery code) is the documented recovery path — generated once, stored off-VPS.

### 5.3 Secrets in transit
- Public traffic: HTTPS only via Let's Encrypt; HSTS, modern TLS only, OCSP stapling.
- Session cookies: `Secure`, `HttpOnly`, `SameSite=Strict`, opaque random IDs (not JWTs), regenerated on login and privilege change.
- Internal traffic stays on Docker bridges that never leave the host.

### 5.4 Authentication
- **Passkeys (WebAuthn)** and **email + password (Argon2id) + TOTP** are both supported per user.
- First-time setup requires at least one passkey OR (password + TOTP). Password-only is rejected.
- Rate limit: **5 attempts per IP per 15 minutes**, exponential backoff after.
- Sessions stored in Postgres with sliding **7-day** expiry, revocable instantly.
- Bootstrap user enrolled via a single-use, 30-minute token printed to the VPS console during install.
- New users via single-use, 24-hour invite link generated by an existing user.

### 5.5 Audit log
- Append-only table; `UPDATE` and `DELETE` revoked on the platform's Postgres role.
- Records every state-changing action: login (success/failure), deploy, env update, domain add/remove, user invite, shell session start/end, etc.
- Stores actor, IP, user-agent, target resource, and a safe metadata diff (never decrypted secret values).

### 5.6 Threat model out-of-scope (v1)
- Malicious user apps attempting Docker escape — apps are trusted code the operator wrote.
- Malicious admin users — all admins have full power by design.
- Host OS compromise via the hosting provider.
- Network-layer DDoS.

## 6. App Lifecycle

### 6.1 Connect a repo
1. Dashboard: "New app" → choose a repo visible to the platform's GitHub App installations.
2. Choose deploy branch (default: repo default).
3. Set auto-deploy on/off (default off).
4. Set build root subdirectory (default `.`).
5. Platform assigns a slug and an internal port from the pool.

### 6.2 Configure (defaults are usable as-is)
- Env vars: key/value, each flagged secret or not. Secrets are write-only after creation (rotate, can't read back).
- Resource limits: default 512 MB RAM, 1.0 CPU (capped globally at install).
- Health check: `GET /` → 2xx within 60s (timeout configurable).
- Restart policy: `unless-stopped`.
- Volumes: declared as mount paths; the platform creates a named Docker volume per `(app, mount_path)` so data survives redeploys.

### 6.3 Deploy (blue/green)
1. `Deployment` row created (`queued`, commit SHA captured).
2. pm-worker claims the job.
3. **Clone**: `git clone --depth 1` at the specific commit using a short-lived (≤1h) GitHub App installation token, into a temp dir on the build volume.
4. **Build**: if `Dockerfile` exists, `docker build` via BuildKit through the socket-proxy; otherwise `nixpacks build`. Image tagged `pm/<slug>:<sha>` (and `:latest`).
5. **Stream logs**: stdout/stderr → Redis pub/sub (live tail in dashboard) + persist to `deployment_logs` (rotated).
6. **Swap**: start `<slug>_<sha>` container on the app's network at a fresh loopback port. Poll the health check. On pass: rewrite the nginx upstream conf, `nginx -t && nginx -s reload` (via helper), mark deployment `succeeded`. On fail within timeout: kill new container, mark `failed`, leave old container running. **The public URL never points at a broken revision.**
7. **Cleanup**: keep the last N (default 5) container+image pairs per app for rollback; prune older ones.

### 6.4 Rollback
Pick any prior successful deployment in the dashboard → "Rollback". Re-runs the swap step against the existing image. No rebuild. Sub-5-second.

### 6.5 Attach a domain
1. Add hostname in the dashboard.
2. Platform shows required DNS A record and `dig`-checks it until it resolves to the VPS IP. Won't proceed otherwise.
3. Helper writes an HTTP-only conf for `/var/www/_acme/` challenge → reload nginx → run `certbot certonly --webroot -w /var/www/_acme -d <domain>`.
4. On success, helper rewrites the conf with the issued cert + HSTS + HTTPS redirect → reload nginx.
5. Cert renewal: standard certbot systemd timer; the renewal hook invokes the helper to reload nginx.

### 6.6 Day-2 operations
- **Logs**: `docker logs --follow` via socket-proxy → WebSocket → dashboard. Persisted for 7 days (rotated).
- **Stop / start / restart**: dashboard buttons through pm-api → socket-proxy.
- **Shell**: `docker exec` piped to browser xterm.js. Session open/close audit-logged (not contents — keeps log small).
- **Env var change**: re-encrypt, write, mark app "needs redeploy" (no surprise restart). Banner in the dashboard.
- **Delete**: confirmation modal → stop + remove containers + remove networks + remove nginx conf. Volumes removed only if separately checked (data loss is opt-in).

## 7. Data Model (Postgres / Drizzle)

```
users(id, email unique, password_hash nullable, totp_secret_enc nullable,
      totp_enabled, created_at, updated_at)

webauthn_credentials(id, user_id → users, credential_id unique, public_key,
                     sign_count, transports, nickname, created_at, last_used_at)

sessions(id, user_id → users, ip_inet, user_agent,
         created_at, last_seen_at, expires_at, revoked_at nullable)

invites(token_hash pk, created_by → users, email nullable,
        expires_at, consumed_at, consumed_by → users nullable)

apps(id, slug unique, github_installation_id, github_repo_full_name,
     default_branch, build_root, auto_deploy, internal_port unique,
     cpu_limit, mem_limit_mb, health_check_path, health_check_status,
     health_check_timeout_s, restart_policy,
     created_by → users, created_at, updated_at, deleted_at nullable)

app_env_vars(id, app_id → apps, key, value_enc, value_nonce, is_secret,
             created_at, updated_at, unique(app_id, key))

app_volumes(id, app_id → apps, mount_path, docker_volume_name,
            created_at, unique(app_id, mount_path))

deployments(id, app_id → apps, commit_sha, commit_message, commit_author,
            trigger, triggered_by → users nullable, status,
            image_tag nullable, container_id nullable, bound_port nullable,
            queued_at, started_at, finished_at, error_summary nullable)

deployment_logs(id, deployment_id → deployments, ts, stream, line)
  -- indexed (deployment_id, ts); pruned to last N lines per deployment

domains(id, app_id → apps, hostname unique, cert_status,
        cert_issued_at nullable, cert_expires_at nullable,
        last_error nullable, created_at, updated_at)

audit_log(id, ts, actor_user_id → users nullable, actor_ip nullable,
          action, target_type nullable, target_id nullable, metadata jsonb)
  -- UPDATE/DELETE revoked on the app role
```

**DB-level invariants:**
- `apps.internal_port` UNIQUE — port pool can't double-allocate.
- `domains.hostname` UNIQUE — global.
- `app_env_vars(app_id, key)` UNIQUE.
- Platform's Postgres role: `SELECT/INSERT/UPDATE/DELETE` on app schema only. No `DROP`, no `CREATE`, not superuser. `UPDATE/DELETE` revoked on `audit_log`.

**Not in the DB:**
- DEK (file: `/etc/projectmng/master.key`).
- Source code or built images (Docker).
- App runtime data (Docker volumes per `(app, mount_path)`).
- GitHub App private key (file: `/etc/projectmng/github-app.pem`).

**Migrations:** drizzle-kit migrations checked into the repo; applied on pm-api startup if schema is behind. Forward-only by convention; rollback is a manual restore from backup.

## 8. Install & Bootstrap

### 8.1 Prerequisites (operator does these once)
- Fresh Debian 12 or Ubuntu 24.04 VPS.
- Docker Engine + Compose plugin installed.
- nginx installed, running as system service.
- certbot installed (`apt install certbot`).
- A non-root sudo user.
- DNS A record `pm.<your-domain>` → VPS IP.
- A GitHub App created with: repo content (read), webhooks (read/write), deployments (write), pull requests (read), metadata (read). Webhook URL: `https://pm.<your-domain>/api/github/webhook`.

### 8.2 One-shot installer

```bash
curl -fsSL https://<release-host>/install.sh | sudo bash -s -- \
    --domain pm.example.com \
    --admin-email you@example.com \
    --github-app-id 12345 \
    --github-app-private-key /path/to/key.pem
```

Installer is a signed, versioned shell script with published SHA-256 sums.

### 8.3 What the installer does
1. Create `projectmng` system user (no shell, no password). Install root: `/opt/projectmng/` (0750, owned by `projectmng`).
2. Provision directories:
   - `/opt/projectmng/data/` — postgres, redis, build cache (0750).
   - `/etc/projectmng/master.key` — 32 bytes from `/dev/urandom` (0400, `projectmng`).
   - `/etc/projectmng/github-app.pem` — copied from the path supplied (0400).
   - `/etc/nginx/sites-enabled/managed/` — root-owned, group-writable by `projectmng` via ACL.
   - `/var/www/_acme/` — certbot webroot.
3. Install host-helper binary at `/usr/local/bin/projectmng-helper` + systemd unit `projectmng-helper.service`. Socket: `/run/projectmng/helper.sock` (0660, group `projectmng`).
4. Install `/etc/sudoers.d/projectmng` with: `projectmng ALL=(root) NOPASSWD: /bin/systemctl reload nginx, /usr/sbin/nginx -t` (belt-and-suspenders; helper is the primary path).
5. Write `/opt/projectmng/docker-compose.yml` with pinned image versions, internal `pm_internal` network, read-only mounts for master.key + GitHub App key, helper socket bind-mount, socket-proxy with allow-list env vars, generated Postgres password in `/opt/projectmng/.env` (0400).
6. Pull images, run migrations, `docker compose up -d`.
7. Write initial nginx config for `pm.<your-domain>` → pm-web loopback port; run certbot to issue the first cert. This validates the whole DNS → nginx → certbot chain before going further.
8. Print a one-time enrollment URL (`https://pm.example.com/enroll/<token>`) — single-use, 30-minute expiry; only the hash is stored in DB.

Operator opens the URL, registers a passkey (or password + TOTP), logs in.

### 8.4 Day-2 install operations
- `sudo projectmng update` — pull new compose + images, migrate, restart.
- `sudo projectmng backup /path/dest.tar.gz` — dumps Postgres + master key + compose file. App runtime volumes are operator's responsibility (documented per-app backup flow in the dashboard).
- `sudo projectmng restore /path/backup.tar.gz` — restores everything except app runtime data.
- `sudo projectmng uninstall` — stops + removes; data removal is a separate flag.

## 9. Testing Strategy (overview — to be detailed in the implementation plan)

- **Unit:** pure logic — port allocator, nixpacks invocation wrapper, nginx config templater, secret encrypt/decrypt, WebAuthn challenge verification.
- **Integration:** pm-api against a real Postgres + Redis in test containers. Auth flows, deploy state machine, env var lifecycle, domain attach state machine.
- **End-to-end:** ephemeral VPS-shaped environment (Docker-in-Docker on a CI runner) running the full compose stack. Deploys a sample Next.js repo from a fixture, attaches a fake domain via a local CA, verifies the URL returns 200.
- **Security tests:** authentication rate-limiting, session revocation, role-grant assertions on the Postgres role, helper command parser fuzz tests, socket-proxy allow-list verification.
- **Manual smoke:** the install script run against a clean Debian VM before each release.

## 10. Open Questions for the Implementation Plan
- Image distribution strategy (public registry vs. private vs. building locally on each release).
- Versioning / release cadence convention.
- Telemetry / opt-in error reporting (default: none).
- Whether the dashboard supports dark mode by default (likely yes via shadcn defaults).
- Exact log retention windows beyond the documented 7-day default.

## 11. Glossary

- **DEK** — Data Encryption Key, the symmetric AES-GCM key used to encrypt per-app env vars.
- **Nixpacks** — auto-Dockerfile generator (https://nixpacks.com), MIT.
- **Socket-proxy** — Tecnativa Docker Socket Proxy (https://github.com/Tecnativa/docker-socket-proxy).
- **Host-helper** — small Go binary on the host that performs the four privileged operations the platform needs.
- **Blue/green swap** — start new revision, wait for health, atomically retarget upstream, then retire the old revision.
