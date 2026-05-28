#!/usr/bin/env bash
# projectMng one-shot installer for Debian 12 / Ubuntu 24.04 hosts.
#
# Re-running this script is safe: it only generates secrets that don't
# already exist, only fetches the helper binary if the digest differs,
# and only requests a fresh cert if one isn't already issued.

set -euo pipefail
shopt -s lastpipe

# ─── flags ───────────────────────────────────────────────────────────────────

DOMAIN=""
ADMIN_EMAIL=""
GITHUB_APP_ID=""
GITHUB_APP_PRIVATE_KEY=""
VERSION=""
SKIP_DNS_CHECK=0
SKIP_LETSENCRYPT=0
LOCAL_ASSETS_DIR=""

usage() {
  cat <<'USAGE'
Usage: install.sh --domain <host> --admin-email <email>
                  --github-app-id <id> --github-app-private-key <path>
                  [--version vX.Y.Z]
                  [--skip-dns-check]
                  [--skip-letsencrypt]
                  [--local-assets <dir>]   # for offline smoke testing
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --github-app-id) GITHUB_APP_ID="$2"; shift 2 ;;
    --github-app-private-key) GITHUB_APP_PRIVATE_KEY="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --skip-dns-check) SKIP_DNS_CHECK=1; shift ;;
    --skip-letsencrypt) SKIP_LETSENCRYPT=1; shift ;;
    --local-assets) LOCAL_ASSETS_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown flag: $1" >&2; usage; exit 64 ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$ADMIN_EMAIL" || -z "$GITHUB_APP_ID" || -z "$GITHUB_APP_PRIVATE_KEY" ]]; then
  usage; exit 64
fi

# ─── helpers ─────────────────────────────────────────────────────────────────

log()  { printf "\033[1;34m[installer]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

require_root() { [[ "$EUID" == 0 ]] || die "run as root"; }

require_cmds() {
  local missing=()
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || missing+=("$c")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    die "missing required commands: ${missing[*]}. On Debian/Ubuntu: apt-get install -y ${missing[*]}"
  fi
}

random_b64url() {
  # 32 bytes → base64url without padding
  head -c 32 /dev/urandom | base64 | tr -d '=\n' | tr '+/' '-_'
}

# ─── preflight ───────────────────────────────────────────────────────────────

require_root
log "preflight"
if ! grep -qE '^(ID|ID_LIKE)=(debian|ubuntu)' /etc/os-release 2>/dev/null; then
  warn "this installer is tested on Debian 12 and Ubuntu 24.04. Continuing anyway."
fi
require_cmds docker nginx curl openssl envsubst tar jq

if ! docker compose version >/dev/null 2>&1; then
  die "docker compose v2 is required. Install docker.io >= 24 or docker-ce."
fi

if [[ "$SKIP_LETSENCRYPT" == 0 ]]; then
  require_cmds certbot dig
fi

# ─── resolve version + assets ────────────────────────────────────────────────

log "resolving version"
RELEASE_REPO="${PROJECTMNG_RELEASE_REPO:-projectmng/projectmng}"
if [[ -z "$VERSION" ]]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${RELEASE_REPO}/releases/latest" | jq -r '.tag_name')"
fi
[[ -n "$VERSION" && "$VERSION" != "null" ]] || die "could not determine version"
log "version: $VERSION"

ASSETS_DIR="$(mktemp -d -t pm-assets.XXXXXX)"
trap 'rm -rf "$ASSETS_DIR"' EXIT

if [[ -n "$LOCAL_ASSETS_DIR" ]]; then
  cp -r "$LOCAL_ASSETS_DIR"/. "$ASSETS_DIR/"
else
  log "fetching release assets"
  base="https://github.com/${RELEASE_REPO}/releases/download/${VERSION}"
  curl -fsSL "$base/metadata.json"               -o "$ASSETS_DIR/metadata.json"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) helper_asset="projectmng-helper-linux-amd64" ;;
    aarch64|arm64) helper_asset="projectmng-helper-linux-arm64" ;;
    *) die "unsupported architecture: $arch" ;;
  esac
  curl -fsSL "$base/${helper_asset}"             -o "$ASSETS_DIR/projectmng-helper"
  expected="$(jq -r --arg k "${helper_asset}.sha256" '.[$k]' "$ASSETS_DIR/metadata.json")"
  actual="$(sha256sum "$ASSETS_DIR/projectmng-helper" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || die "helper sha256 mismatch (expected $expected, got $actual)"
fi

# ─── user + dirs ─────────────────────────────────────────────────────────────

log "creating projectmng user/group + directories"
getent group projectmng  >/dev/null || groupadd -r projectmng
getent passwd projectmng >/dev/null || useradd  -r -g projectmng -d /opt/projectmng -s /usr/sbin/nologin projectmng
PM_UID="$(id -u projectmng)"
PM_GID="$(id -g projectmng)"

install -d -m 0755                                /opt/projectmng /opt/projectmng/data
install -d -m 0700 -o projectmng -g projectmng    /etc/projectmng
install -d -m 0755                                /etc/nginx/sites-enabled/managed /var/www/_acme
install -d -m 0755 -o projectmng -g projectmng    /run/projectmng

# ─── master key + GitHub App private key ─────────────────────────────────────

if [[ ! -e /etc/projectmng/master.key ]]; then
  log "generating master key (one-time)"
  head -c 32 /dev/urandom > /etc/projectmng/master.key
  chmod 0400 /etc/projectmng/master.key
  chown projectmng:projectmng /etc/projectmng/master.key
  warn "MASTER KEY GENERATED. Back up /etc/projectmng/master.key off-host — losing it loses every encrypted secret."
fi

log "installing GitHub App private key"
[[ -r "$GITHUB_APP_PRIVATE_KEY" ]] || die "cannot read GitHub App key at $GITHUB_APP_PRIVATE_KEY"
openssl rsa -in "$GITHUB_APP_PRIVATE_KEY" -noout -check >/dev/null 2>&1 || die "GitHub App key did not parse as PEM-encoded RSA"
install -m 0400 -o projectmng -g projectmng "$GITHUB_APP_PRIVATE_KEY" /etc/projectmng/github-app.pem

# ─── helper binary + systemd unit ────────────────────────────────────────────

log "installing helper binary"
install -m 0755 "$ASSETS_DIR/projectmng-helper" /usr/local/bin/projectmng-helper

cat > /etc/systemd/system/projectmng-helper.service <<'UNIT'
[Unit]
Description=projectMng host helper (nginx + certbot proxy)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
RuntimeDirectory=projectmng
RuntimeDirectoryMode=0750
RuntimeDirectoryPreserve=yes
Environment=PROJECTMNG_SOCKET_PATH=/run/projectmng/helper.sock
Environment=PROJECTMNG_SOCKET_GROUP=projectmng
ExecStart=/usr/local/bin/projectmng-helper
Restart=on-failure
RestartSec=2s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now projectmng-helper

# ─── secrets + .env ──────────────────────────────────────────────────────────

ENV_FILE=/opt/projectmng/.env
if [[ ! -e "$ENV_FILE" ]]; then
  log "generating secrets"
  POSTGRES_PASSWORD="$(random_b64url)"
  COOKIE_SECRET="$(random_b64url)"
  GITHUB_WEBHOOK_SECRET="$(random_b64url)"
  cat > "$ENV_FILE" <<ENV
VERSION=$VERSION
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
COOKIE_SECRET=$COOKIE_SECRET
GITHUB_APP_ID=$GITHUB_APP_ID
GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET
PUBLIC_BASE_URL=https://$DOMAIN
WEBAUTHN_RP_ID=$DOMAIN
ACME_EMAIL=$ADMIN_EMAIL
PM_UID=$PM_UID
PM_GID=$PM_GID
ENV
  chown projectmng:projectmng "$ENV_FILE"
  chmod 0400 "$ENV_FILE"
else
  log "reusing existing .env"
  # Always rewrite VERSION on re-run so updates take effect.
  sed -i -E "s|^VERSION=.*|VERSION=$VERSION|" "$ENV_FILE"
fi

# ─── render docker-compose ───────────────────────────────────────────────────

log "rendering docker-compose.yml"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_TMPL="${PROJECTMNG_COMPOSE_TMPL:-$SCRIPT_DIR/compose/docker-compose.yml.tmpl}"
NGINX_TMPL="${PROJECTMNG_NGINX_TMPL:-$SCRIPT_DIR/nginx/pm-dashboard.conf.tmpl}"
[[ -r "$COMPOSE_TMPL" ]] || die "missing compose template: $COMPOSE_TMPL"
[[ -r "$NGINX_TMPL"   ]] || die "missing nginx template:   $NGINX_TMPL"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

envsubst < "$COMPOSE_TMPL" > /opt/projectmng/docker-compose.yml
chown projectmng:projectmng /opt/projectmng/docker-compose.yml

# ─── pull + start ────────────────────────────────────────────────────────────

log "pulling images"
docker compose -f /opt/projectmng/docker-compose.yml pull
log "starting stack"
docker compose -f /opt/projectmng/docker-compose.yml up -d

# ─── wait for pm-api + migrate ───────────────────────────────────────────────

log "waiting for pm-api to come up"
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3001/api/me >/dev/null 2>&1 \
     || curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/me 2>/dev/null | grep -q 401; then
    break
  fi
  sleep 1
  [[ $i -eq 60 ]] && die "pm-api did not become reachable on :3001"
done

log "running database migrations"
docker compose -f /opt/projectmng/docker-compose.yml exec -T pm-api npm run db:migrate

# ─── nginx + cert ────────────────────────────────────────────────────────────

# Render HTTP-only nginx first so certbot --webroot can answer challenges.
HTTP_ONLY_CONF=$(cat <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/_acme; }
    location / { return 503 "cert pending"; }
}
NGINX
)
echo "$HTTP_ONLY_CONF" > /etc/nginx/sites-enabled/pm-dashboard.conf
nginx -t
systemctl reload nginx

if [[ "$SKIP_DNS_CHECK" == 0 ]]; then
  log "checking DNS for $DOMAIN"
  if ! dig +short "$DOMAIN" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    warn "DNS A record for $DOMAIN does not resolve to an IPv4 address — Let's Encrypt will fail."
  fi
fi

if [[ "$SKIP_LETSENCRYPT" == 0 ]]; then
  log "issuing certificate via Let's Encrypt"
  certbot certonly --webroot -w /var/www/_acme -d "$DOMAIN" \
    -n --agree-tos -m "$ADMIN_EMAIL" || die "certbot failed"
fi

if [[ "$SKIP_LETSENCRYPT" == 0 ]] || [[ -e /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]]; then
  log "rendering full HTTPS nginx config"
  PUBLIC_HOSTNAME="$DOMAIN" envsubst '$PUBLIC_HOSTNAME' < "$NGINX_TMPL" > /etc/nginx/sites-enabled/pm-dashboard.conf
  nginx -t
  systemctl reload nginx
else
  log "skipped Let's Encrypt; leaving HTTP-only nginx config in place"
fi

# ─── bootstrap enrollment token ──────────────────────────────────────────────

log "generating bootstrap enrollment token"
BOOTSTRAP=$(curl -fsS -X POST http://127.0.0.1:3001/api/admin/bootstrap || true)
TOKEN=$(printf '%s' "$BOOTSTRAP" | jq -r '.token // empty')

# Record installed version so projectmng update can compute the diff.
echo "$VERSION" > /opt/projectmng/.version
chown projectmng:projectmng /opt/projectmng/.version
chmod 0644 /opt/projectmng/.version

# ─── final banner ────────────────────────────────────────────────────────────

cat <<DONE

────────────────────────────────────────────────────────────────────
projectMng is installed.

DONE

if [[ -n "$TOKEN" ]]; then
  cat <<DONE
Open this URL in your browser to register the first admin:
  https://$DOMAIN/enroll/$TOKEN

(Single-use; expires in 30 minutes.)

DONE
else
  warn "Bootstrap endpoint returned no token. If you already enrolled, ignore this. Otherwise re-run install.sh after fixing the issue."
fi

cat <<DONE
Day-2 commands:
  sudo projectmng update      # pull new images, migrate, restart
  sudo projectmng backup ...  # dump pg + master key + compose file
  sudo projectmng restore ... # restore from a backup
  sudo projectmng uninstall   # stop everything; data optional
────────────────────────────────────────────────────────────────────
DONE
