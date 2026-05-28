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
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl docker.io \
 && rm -rf /var/lib/apt/lists/*

# Install nixpacks (auto-Dockerfile path for apps without their own).
ARG NIXPACKS_VERSION=1.29.0
ARG TARGETARCH
RUN ARCH="${TARGETARCH:-amd64}" \
 && curl -sSL "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-v${NIXPACKS_VERSION}-${ARCH}.deb" -o /tmp/nixpacks.deb \
 && dpkg -i /tmp/nixpacks.deb \
 && rm /tmp/nixpacks.deb

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/db/migrations ./src/db/migrations

ENV NODE_ENV=production

# Default to pm-api; the worker service overrides this via the compose `command:` key.
CMD ["node", "dist/index.api.js"]
