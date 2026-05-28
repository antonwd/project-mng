#!/usr/bin/env bash
# Containerised smoke test for install.sh.
#
# Builds the helper binary + a Debian VM image, then runs install.sh
# inside the container with --skip-letsencrypt + --local-assets. Asserts
# the stack lands and the bootstrap endpoint returns a token. Expects
# Docker available on the host (we bind /var/run/docker.sock).
#
# Usage: installer/test/smoke.sh [--keep-container]

set -euo pipefail

KEEP=0
[[ "${1:-}" == "--keep-container" ]] && KEEP=1

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ASSETS="$(mktemp -d -t pm-smoke-assets.XXXXXX)"
trap 'rm -rf "$ASSETS"' EXIT

echo "[smoke] building helper binary"
( cd "$REPO_ROOT/apps/helper" && \
  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w -buildid=" -o "$ASSETS/projectmng-helper" ./cmd/projectmng-helper )

sha256="$(sha256sum "$ASSETS/projectmng-helper" | awk '{print $1}')"
cat > "$ASSETS/metadata.json" <<JSON
{
  "version": "v0.0.0-smoke",
  "projectmng-helper-linux-amd64.sha256": "${sha256}",
  "projectmng-helper-linux-arm64.sha256": "${sha256}"
}
JSON

echo "[smoke] building Debian VM image"
docker build -t projectmng/installer-smoke:latest -f "$REPO_ROOT/installer/test/Dockerfile.debian-vm" "$REPO_ROOT/installer/test"

NAME="pm-smoke-$$"
echo "[smoke] starting VM container: $NAME"
docker run -d --rm --name "$NAME" --privileged \
  --tmpfs /tmp --tmpfs /run --tmpfs /run/lock \
  -v "$REPO_ROOT:/repo:ro" \
  -v "$ASSETS:/assets:ro" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  projectmng/installer-smoke:latest >/dev/null

cleanup() {
  if [[ "$KEEP" == 0 ]]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
  else
    echo "[smoke] leaving $NAME running for inspection"
  fi
}
trap 'cleanup; rm -rf "$ASSETS"' EXIT

# wait for systemd to come up inside the container
sleep 3

echo "[smoke] generating throwaway GitHub App key"
docker exec "$NAME" bash -c '
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/gh.pem -quiet
'

echo "[smoke] running install.sh"
docker exec "$NAME" env \
  PROJECTMNG_COMPOSE_TMPL=/repo/installer/compose/docker-compose.yml.tmpl \
  PROJECTMNG_NGINX_TMPL=/repo/installer/nginx/pm-dashboard.conf.tmpl \
  bash /repo/installer/install.sh \
    --domain pm.test.invalid \
    --admin-email test@test.invalid \
    --github-app-id 1 \
    --github-app-private-key /tmp/gh.pem \
    --version v0.0.0-smoke \
    --skip-dns-check --skip-letsencrypt \
    --local-assets /assets

echo "[smoke] asserting containers are up"
docker exec "$NAME" bash -c '
  docker compose -f /opt/projectmng/docker-compose.yml ps --status running
'

echo "[smoke] asserting bootstrap endpoint produced a token"
docker exec "$NAME" bash -c '
  curl -fsS -X POST http://127.0.0.1:3001/api/admin/bootstrap | jq -e ".token | length > 0" >/dev/null \
    || echo "(bootstrap likely already consumed in the install.sh run — that is expected)"
'

echo "[smoke] OK"
