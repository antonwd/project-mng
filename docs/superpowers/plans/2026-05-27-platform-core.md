# Platform Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pm-api` and `pm-worker` — the backend of projectMng. A TypeScript Fastify HTTP+WebSocket service backed by Postgres (via Drizzle), with auth (passkeys + password+TOTP), encrypted per-app secrets, GitHub App integration, a BullMQ-driven build/deploy pipeline that talks to the Docker Socket Proxy and the host-helper from Plan 1, and an append-only audit log.

**Architecture:** Two Node processes from the same image, different entry points. `pm-api` serves HTTP+WS to `pm-web` (Plan 3) and to the GitHub webhook. `pm-worker` is a BullMQ consumer for clone/build/swap/cert jobs. Postgres is the only durable state (plus Docker volumes for app data). Redis is queue + pub/sub for live logs. All four privileged operations (nginx write, nginx reload, certbot issue, certbot renew) go through the Plan 1 helper Unix socket. All Docker operations go through the Tecnativa Docker Socket Proxy. AES-256-GCM at rest for secrets; opaque session cookies (not JWTs); rate-limited auth; append-only audit log enforced by Postgres role grants.

**Tech Stack:** Node 20 LTS, TypeScript, Fastify 4, Drizzle ORM + drizzle-kit, PostgreSQL 16, Redis 7, BullMQ 5, `@simplewebauthn/server`, `otplib`, `argon2`, `dockerode` (talks to the socket proxy), `@octokit/auth-app` + `@octokit/rest`, `vitest`, `pino` (Fastify's default logger).

**Repo layout established by Task 1** (additions to the monorepo set up in Plan 1):

```
projectMng/
├── apps/
│   ├── helper/                        (Plan 1)
│   ├── api/                           (this plan creates everything here)
│   │   ├── .gitignore
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── drizzle.config.ts
│   │   ├── src/
│   │   │   ├── index.api.ts           (entry: pm-api)
│   │   │   ├── index.worker.ts        (entry: pm-worker)
│   │   │   ├── config.ts              (env loader + validator)
│   │   │   ├── db/
│   │   │   │   ├── client.ts          (pg pool + Drizzle handle)
│   │   │   │   ├── schema.ts          (all tables)
│   │   │   │   └── migrations/        (drizzle-kit output)
│   │   │   ├── crypto/
│   │   │   │   ├── master-key.ts      (load + sanity-check)
│   │   │   │   ├── secrets.ts         (AES-256-GCM encrypt/decrypt)
│   │   │   │   └── tokens.ts          (random tokens, hashing)
│   │   │   ├── clients/
│   │   │   │   ├── helper.ts          (Unix-socket client → Plan 1)
│   │   │   │   ├── docker.ts          (dockerode → socket proxy)
│   │   │   │   └── github.ts          (GitHub App auth + repo APIs)
│   │   │   ├── auth/
│   │   │   │   ├── password.ts        (argon2id)
│   │   │   │   ├── totp.ts            (otplib wrapper)
│   │   │   │   ├── webauthn.ts        (@simplewebauthn/server wrapper)
│   │   │   │   ├── sessions.ts        (issue/lookup/revoke)
│   │   │   │   ├── rate-limit.ts      (Redis-backed)
│   │   │   │   └── audit.ts           (append-only writer)
│   │   │   ├── domain/
│   │   │   │   ├── apps.ts            (port allocator + app CRUD)
│   │   │   │   ├── env-vars.ts        (encrypted env var CRUD)
│   │   │   │   ├── volumes.ts
│   │   │   │   ├── domains.ts         (DNS check, cert lifecycle)
│   │   │   │   ├── deployments.ts     (state machine + queue producer)
│   │   │   │   └── invites.ts
│   │   │   ├── http/
│   │   │   │   ├── server.ts          (Fastify factory)
│   │   │   │   ├── plugins/           (auth, cors, error)
│   │   │   │   ├── routes/
│   │   │   │   │   ├── auth.ts
│   │   │   │   │   ├── enroll.ts
│   │   │   │   │   ├── invites.ts
│   │   │   │   │   ├── users.ts
│   │   │   │   │   ├── apps.ts
│   │   │   │   │   ├── deployments.ts
│   │   │   │   │   ├── domains.ts
│   │   │   │   │   ├── env-vars.ts
│   │   │   │   │   ├── volumes.ts
│   │   │   │   │   ├── audit.ts
│   │   │   │   │   ├── github-webhook.ts
│   │   │   │   │   └── ws-logs.ts     (WebSocket)
│   │   │   ├── worker/
│   │   │   │   ├── queue.ts           (BullMQ setup)
│   │   │   │   ├── jobs/
│   │   │   │   │   ├── deploy.ts      (clone→build→swap)
│   │   │   │   │   ├── cert-issue.ts
│   │   │   │   │   └── cert-renew.ts
│   │   │   │   └── log-stream.ts      (Redis pub/sub bridge)
│   │   │   └── lib/
│   │   │       ├── nginx-template.ts  (managed site config renderer)
│   │   │       ├── nixpacks.ts        (subprocess wrapper)
│   │   │       └── errors.ts          (HTTPError hierarchy)
│   │   └── test/
│   │       ├── setup.ts               (Postgres+Redis test container)
│   │       ├── fixtures/
│   │       └── ... (per-module *.test.ts colocated with source)
```

**Conventions:**
- Vitest tests live next to source as `*.test.ts`; integration tests under `apps/api/test/`.
- Every test that touches the DB or Redis uses Testcontainers (`@testcontainers/postgresql`, `@testcontainers/redis`) — no shared external state.
- All env vars are validated through a single `loadConfig()` in `src/config.ts` using `zod`. No `process.env.X` access scattered through the code.
- Every state-changing API route writes to `audit_log` before returning.
- Errors thrown as `HTTPError(status, code, message)` from `lib/errors.ts`; a Fastify error handler converts them to `{ error: { code, message } }` JSON. Never leak stack traces in production.
- Commits use Conventional Commits with the `api:` scope, ending with the project's standard co-author trailer.

**Phases (this plan is structured into phases so you can review at logical break points):**

- **Phase A (Tasks 1–4):** TypeScript project skeleton, config loader, Drizzle schema + migrations, Postgres test harness.
- **Phase B (Tasks 5–7):** Crypto primitives (master key loader, AES-GCM secrets, opaque token helpers).
- **Phase C (Tasks 8–10):** External clients (helper Unix-socket client, Docker socket-proxy client, GitHub App client).
- **Phase D (Tasks 11–14):** Auth primitives (argon2 passwords, TOTP, WebAuthn challenges, sessions, rate-limit).
- **Phase E (Tasks 15–17):** Fastify app skeleton, error handling, audit log writer, auth middleware.
- **Phase F (Tasks 18–22):** Enrollment, invites, users, login/logout routes.
- **Phase G (Tasks 23–27):** Apps CRUD, env vars, volumes, domains, port allocator.
- **Phase H (Tasks 28–32):** Deployment state machine, BullMQ queue, deploy job (clone→build→swap), cert issue/renew jobs, nginx config templater.
- **Phase I (Tasks 33–35):** WebSocket live logs, container shell pass-through, GitHub webhook receiver.
- **Phase J (Task 36):** End-to-end smoke that drives the API to deploy a tiny fixture app against a real Docker engine.

---

## Phase A — Foundation

## Task 1: Project bootstrap

**Files:**
- Create: `apps/api/.gitignore`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/index.api.ts` (placeholder)
- Create: `apps/api/src/index.worker.ts` (placeholder)

- [ ] **Step 1: Create the subtree**

From repo root, run:

```bash
mkdir -p apps/api/src/{db,crypto,clients,auth,domain,http/plugins,http/routes,worker/jobs,lib} apps/api/test/fixtures
```

- [ ] **Step 2: Create `apps/api/.gitignore`**

```
node_modules/
dist/
coverage/
.env
.env.local
*.log
.vitest-cache/
```

- [ ] **Step 3: Create `apps/api/package.json`**

```json
{
  "name": "@projectmng/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20.0.0 <21.0.0" },
  "scripts": {
    "dev:api": "tsx watch src/index.api.ts",
    "dev:worker": "tsx watch src/index.worker.ts",
    "build": "tsc -p tsconfig.json",
    "start:api": "node dist/index.api.js",
    "start:worker": "node dist/index.worker.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint 'src/**/*.ts' 'test/**/*.ts'",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@fastify/cookie": "^9.3.1",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/websocket": "^10.0.1",
    "@octokit/auth-app": "^7.1.1",
    "@octokit/rest": "^21.0.2",
    "@simplewebauthn/server": "^11.0.0",
    "argon2": "^0.41.1",
    "bullmq": "^5.20.1",
    "dockerode": "^4.0.2",
    "drizzle-orm": "^0.36.0",
    "fastify": "^4.28.1",
    "ioredis": "^5.4.1",
    "otplib": "^12.0.1",
    "pg": "^8.13.1",
    "pino": "^9.4.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.13.2",
    "@testcontainers/redis": "^10.13.2",
    "@types/dockerode": "^3.3.32",
    "@types/node": "^20.16.10",
    "@types/pg": "^8.11.10",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "drizzle-kit": "^0.27.0",
    "eslint": "^9.11.1",
    "testcontainers": "^10.13.2",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 4: Create `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "declaration": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "test"]
}
```

- [ ] **Step 5: Create `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
```

- [ ] **Step 6: Create placeholder entry points**

`apps/api/src/index.api.ts`:

```ts
// pm-api entry point (real implementation lands in Phase E).
console.log("pm-api: not yet implemented");
```

`apps/api/src/index.worker.ts`:

```ts
// pm-worker entry point (real implementation lands in Phase H).
console.log("pm-worker: not yet implemented");
```

- [ ] **Step 7: Install dependencies and verify TypeScript compiles**

From `apps/api/`:

```bash
npm install
npm run typecheck
```

Expected: `npm install` succeeds; `typecheck` exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/.gitignore apps/api/package.json apps/api/package-lock.json apps/api/tsconfig.json apps/api/vitest.config.ts apps/api/src/index.api.ts apps/api/src/index.worker.ts
git commit -m "$(cat <<'EOF'
api: bootstrap TypeScript project (Fastify + Drizzle + BullMQ deps)

Two entry points (pm-api, pm-worker) from the same source tree. Node 20 LTS.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Config loader (env → typed)

**Files:**
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/config.test.ts`

**Why:** every env-var read in the codebase must go through one validated schema. Missing vars fail at startup with a clear message, not at first use.

- [ ] **Step 1: Write the failing test**

`apps/api/src/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const baseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://x:y@localhost:5432/z",
  REDIS_URL: "redis://localhost:6379",
  MASTER_KEY_PATH: "/run/secrets/master.key",
  HELPER_SOCKET_PATH: "/run/projectmng/helper.sock",
  DOCKER_PROXY_URL: "http://docker-socket-proxy:2375",
  GITHUB_APP_ID: "12345",
  GITHUB_APP_PRIVATE_KEY_PATH: "/run/secrets/github-app.pem",
  GITHUB_WEBHOOK_SECRET: "whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  PUBLIC_BASE_URL: "https://pm.example.com",
  WEBAUTHN_RP_ID: "pm.example.com",
  WEBAUTHN_RP_NAME: "projectMng",
  COOKIE_SECRET: "x".repeat(32),
  INTERNAL_PORT_MIN: "10000",
  INTERNAL_PORT_MAX: "19999",
  NGINX_MANAGED_DIR: "/etc/nginx/sites-enabled/managed",
  ACME_EMAIL: "you@example.com",
};

describe("loadConfig", () => {
  it("parses a valid env", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.databaseUrl).toBe(baseEnv.DATABASE_URL);
    expect(cfg.internalPortMin).toBe(10000);
    expect(cfg.internalPortMax).toBe(19999);
  });

  it("rejects a missing required var", () => {
    const env = { ...baseEnv } as Record<string, string | undefined>;
    delete env.DATABASE_URL;
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it("rejects a short cookie secret", () => {
    expect(() => loadConfig({ ...baseEnv, COOKIE_SECRET: "tooshort" }))
      .toThrow(/COOKIE_SECRET/);
  });

  it("rejects an inverted port range", () => {
    expect(() => loadConfig({ ...baseEnv, INTERNAL_PORT_MIN: "20000" }))
      .toThrow(/INTERNAL_PORT/);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

From `apps/api/`: `npm test -- config.test`. Expected: `Cannot find module './config.js'`.

- [ ] **Step 3: Implement `config.ts`**

```ts
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    MASTER_KEY_PATH: z.string().min(1),
    HELPER_SOCKET_PATH: z.string().min(1),
    DOCKER_PROXY_URL: z.string().url(),
    GITHUB_APP_ID: z.string().regex(/^\d+$/),
    GITHUB_APP_PRIVATE_KEY_PATH: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(20),
    PUBLIC_BASE_URL: z.string().url(),
    WEBAUTHN_RP_ID: z.string().min(1),
    WEBAUTHN_RP_NAME: z.string().min(1),
    COOKIE_SECRET: z.string().min(32),
    INTERNAL_PORT_MIN: z.string().regex(/^\d+$/),
    INTERNAL_PORT_MAX: z.string().regex(/^\d+$/),
    NGINX_MANAGED_DIR: z.string().min(1),
    ACME_EMAIL: z.string().email(),
    HTTP_PORT: z.string().regex(/^\d+$/).default("3000"),
  })
  .superRefine((env, ctx) => {
    const min = Number(env.INTERNAL_PORT_MIN);
    const max = Number(env.INTERNAL_PORT_MAX);
    if (min >= max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_PORT_MIN"],
        message: "INTERNAL_PORT_MIN must be < INTERNAL_PORT_MAX",
      });
    }
  });

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  redisUrl: string;
  masterKeyPath: string;
  helperSocketPath: string;
  dockerProxyUrl: string;
  githubAppId: string;
  githubAppPrivateKeyPath: string;
  githubWebhookSecret: string;
  publicBaseUrl: string;
  webauthnRpId: string;
  webauthnRpName: string;
  cookieSecret: string;
  internalPortMin: number;
  internalPortMax: number;
  nginxManagedDir: string;
  acmeEmail: string;
  httpPort: number;
};

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const summary = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid config: ${summary}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    masterKeyPath: e.MASTER_KEY_PATH,
    helperSocketPath: e.HELPER_SOCKET_PATH,
    dockerProxyUrl: e.DOCKER_PROXY_URL,
    githubAppId: e.GITHUB_APP_ID,
    githubAppPrivateKeyPath: e.GITHUB_APP_PRIVATE_KEY_PATH,
    githubWebhookSecret: e.GITHUB_WEBHOOK_SECRET,
    publicBaseUrl: e.PUBLIC_BASE_URL,
    webauthnRpId: e.WEBAUTHN_RP_ID,
    webauthnRpName: e.WEBAUTHN_RP_NAME,
    cookieSecret: e.COOKIE_SECRET,
    internalPortMin: Number(e.INTERNAL_PORT_MIN),
    internalPortMax: Number(e.INTERNAL_PORT_MAX),
    nginxManagedDir: e.NGINX_MANAGED_DIR,
    acmeEmail: e.ACME_EMAIL,
    httpPort: Number(e.HTTP_PORT),
  };
}
```

- [ ] **Step 4: Run the test to confirm pass**

From `apps/api/`: `npm test -- config.test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/config.test.ts
git commit -m "$(cat <<'EOF'
api: add zod-validated config loader (env → typed AppConfig)

Every runtime env-var read goes through loadConfig(). Missing or invalid
vars fail at startup with a clear summary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Postgres test harness

**Files:**
- Create: `apps/api/test/setup.ts`
- Create: `apps/api/test/setup.test.ts`

**Why:** every DB-touching test will start an ephemeral Postgres via Testcontainers and apply migrations once per file. Centralising the setup makes per-test code small and deterministic.

- [ ] **Step 1: Write the failing test**

`apps/api/test/setup.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { startTestPostgres, stopTestPostgres } from "./setup.js";

describe("test postgres harness", () => {
  afterAll(async () => {
    await stopTestPostgres();
  });

  it("starts a postgres container and returns a DATABASE_URL", async () => {
    const url = await startTestPostgres();
    expect(url).toMatch(/^postgres:\/\/.*@.*:\d+\/.*$/);
  });

  it("returns the same URL on the second call (singleton)", async () => {
    const a = await startTestPostgres();
    const b = await startTestPostgres();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

`npm test -- test/setup.test`. Expected: missing module.

- [ ] **Step 3: Implement `apps/api/test/setup.ts`**

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let containerPromise: Promise<StartedPostgreSqlContainer> | null = null;

export async function startTestPostgres(): Promise<string> {
  if (!containerPromise) {
    containerPromise = new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("projectmng_test")
      .withUsername("test")
      .withPassword("test")
      .start();
  }
  const c = await containerPromise;
  return c.getConnectionUri();
}

export async function stopTestPostgres(): Promise<void> {
  if (!containerPromise) return;
  const c = await containerPromise;
  await c.stop({ remove: true });
  containerPromise = null;
}
```

- [ ] **Step 4: Run the test to confirm pass**

`npm test -- test/setup.test`. Expected: passes. (Requires Docker running; on CI use a Docker-enabled runner.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/setup.ts apps/api/test/setup.test.ts
git commit -m "$(cat <<'EOF'
api: add Testcontainers-based Postgres harness

Singleton-per-process container. Used by every DB-touching test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Drizzle schema + migrations

**Files:**
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/src/db/migrations/` (generated)
- Create: `apps/api/src/db/schema.test.ts`

**Why:** Schema mirrors spec section 7 exactly. One migration generated up-front; later schema changes get new migrations on top.

- [ ] **Step 1: Write the failing test**

`apps/api/src/db/schema.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import * as schema from "./schema.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  const url = await startTestPostgres();
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
});

afterAll(async () => {
  await pool?.end();
  await stopTestPostgres();
});

describe("schema", () => {
  it("creates the apps table with internal_port unique", async () => {
    const result = await pool.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'apps'::regclass AND contype = 'u'`,
    );
    const names = result.rows.map((r) => r.conname as string);
    expect(names.some((n) => n.includes("internal_port"))).toBe(true);
  });

  it("creates the domains.hostname unique constraint", async () => {
    const result = await pool.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'domains'::regclass AND contype = 'u'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("creates app_env_vars(app_id, key) unique", async () => {
    const result = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'app_env_vars' AND indexdef ILIKE '%unique%'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("seeds a user and inserts a sample app via drizzle", async () => {
    const [user] = await db.insert(schema.users).values({
      email: "e2e@example.com",
    }).returning();
    expect(user.id).toBeTypeOf("string");

    const [app] = await db.insert(schema.apps).values({
      slug: "sample",
      githubInstallationId: 1n,
      githubRepoFullName: "owner/sample",
      defaultBranch: "main",
      internalPort: 10001,
      createdBy: user.id,
    }).returning();
    expect(app.slug).toBe("sample");

    // teardown to keep tests independent
    await db.delete(schema.apps).where(sql`id = ${app.id}`);
    await db.delete(schema.users).where(sql`id = ${user.id}`);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

`npm test -- src/db/schema.test`. Expected: `Cannot find module './schema.js'`.

- [ ] **Step 3: Create `drizzle.config.ts`**

`apps/api/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});
```

- [ ] **Step 4: Implement `apps/api/src/db/schema.ts`**

```ts
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  bigserial,
  timestamp,
  jsonb,
  inet,
  customType,
  unique,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// citext is not built-in; declare a tiny custom type that maps to it.
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array) {
    return Buffer.from(value);
  },
  fromDriver(value: Buffer) {
    return new Uint8Array(value);
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash"),
  totpSecretEnc: bytea("totp_secret_enc"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  credentialId: bytea("credential_id").notNull().unique(),
  publicKey: bytea("public_key").notNull(),
  signCount: bigint("sign_count", { mode: "bigint" }).notNull().default(0n),
  transports: text("transports").array().notNull().default(sql`'{}'::text[]`),
  nickname: text("nickname").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ipInet: inet("ip_inet"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const invites = pgTable("invites", {
  tokenHash: bytea("token_hash").primaryKey(),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  consumedBy: uuid("consumed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apps = pgTable("apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  githubInstallationId: bigint("github_installation_id", { mode: "bigint" }).notNull(),
  githubRepoFullName: text("github_repo_full_name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  buildRoot: text("build_root").notNull().default("."),
  autoDeploy: boolean("auto_deploy").notNull().default(false),
  internalPort: integer("internal_port").notNull().unique(),
  cpuLimit: numeric("cpu_limit", { precision: 4, scale: 2 }).notNull().default("1.00"),
  memLimitMb: integer("mem_limit_mb").notNull().default(512),
  healthCheckPath: text("health_check_path").notNull().default("/"),
  healthCheckStatus: integer("health_check_status").notNull().default(200),
  healthCheckTimeoutS: integer("health_check_timeout_s").notNull().default(60),
  restartPolicy: text("restart_policy").notNull().default("unless-stopped"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const appEnvVars = pgTable(
  "app_env_vars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEnc: bytea("value_enc").notNull(),
    valueNonce: bytea("value_nonce").notNull(),
    isSecret: boolean("is_secret").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqAppKey: unique("app_env_vars_app_id_key_uniq").on(t.appId, t.key),
  }),
);

export const appVolumes = pgTable(
  "app_volumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
    mountPath: text("mount_path").notNull(),
    dockerVolumeName: text("docker_volume_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqAppMount: unique("app_volumes_app_id_mount_uniq").on(t.appId, t.mountPath),
  }),
);

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  commitSha: text("commit_sha").notNull(),
  commitMessage: text("commit_message"),
  commitAuthor: text("commit_author"),
  trigger: text("trigger").notNull(),
  triggeredBy: uuid("triggered_by").references(() => users.id),
  status: text("status").notNull().default("queued"),
  imageTag: text("image_tag"),
  containerId: text("container_id"),
  boundPort: integer("bound_port"),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorSummary: text("error_summary"),
});

export const deploymentLogs = pgTable(
  "deployment_logs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    deploymentId: uuid("deployment_id").notNull().references(() => deployments.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    stream: text("stream").notNull(),
    line: text("line").notNull(),
  },
  (t) => ({
    byDeployTs: index("deployment_logs_dep_ts_idx").on(t.deploymentId, t.ts),
  }),
);

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  appId: uuid("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  certStatus: text("cert_status").notNull().default("pending_dns"),
  certIssuedAt: timestamp("cert_issued_at", { withTimezone: true }),
  certExpiresAt: timestamp("cert_expires_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorIp: inet("actor_ip"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    byTs: index("audit_log_ts_idx").on(t.ts),
    byActor: index("audit_log_actor_idx").on(t.actorUserId),
  }),
);
```

- [ ] **Step 5: Implement `apps/api/src/db/client.ts`**

```ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(databaseUrl: string): { pool: Pool; db: Database } {
  const pool = new Pool({ connectionString: databaseUrl, max: 20 });
  const db = drizzle(pool, { schema });
  return { pool, db };
}
```

- [ ] **Step 6: Implement `apps/api/src/db/migrate.ts`**

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";
import { loadConfig } from "../config.js";

async function main() {
  const cfg = loadConfig();
  const { pool, db } = createDb(cfg.databaseUrl);
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  await pool.end();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 7: Generate the initial migration**

From `apps/api/`:

```bash
mkdir -p src/db/migrations
DATABASE_URL=postgres://placeholder:placeholder@localhost:5432/placeholder npm run db:generate
```

Expected: `drizzle-kit` writes one SQL file under `src/db/migrations/` plus a `meta/_journal.json`. Open the SQL file; it should `CREATE EXTENSION IF NOT EXISTS citext;` near the top — if not, prepend that line manually (Drizzle's custom type emits the column type but not the extension).

If the generated file lacks the extension, add it as the first statement:

```sql
CREATE EXTENSION IF NOT EXISTS citext;
```

- [ ] **Step 8: Run the schema test to confirm pass**

`npm test -- src/db/schema.test`. Expected: passes (Postgres container starts, migrations run, all assertions pass).

- [ ] **Step 9: Commit**

```bash
git add apps/api/drizzle.config.ts apps/api/src/db/
git commit -m "$(cat <<'EOF'
api: add Drizzle schema, client, migrator and initial migration

Tables: users, webauthn_credentials, sessions, invites, apps, app_env_vars,
app_volumes, deployments, deployment_logs, domains, audit_log. citext
extension enabled.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Crypto primitives

## Task 5: Master key loader

**Files:**
- Create: `apps/api/src/crypto/master-key.ts`
- Create: `apps/api/src/crypto/master-key.test.ts`

**Behaviour:** read 32 raw bytes from `cfg.masterKeyPath`. Refuse if file mode is broader than 0400 (best-effort — only enforced on POSIX). Cache in module-level memory after first successful load.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadMasterKey, _resetMasterKeyCacheForTests } from "./master-key.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mk-"));
  _resetMasterKeyCacheForTests();
});

describe("loadMasterKey", () => {
  it("loads a 32-byte key from a 0400 file", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(32, 1));
    chmodSync(p, 0o400);
    const key = loadMasterKey(p);
    expect(key.length).toBe(32);
  });

  it("rejects a file that is not exactly 32 bytes", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(16, 1));
    chmodSync(p, 0o400);
    expect(() => loadMasterKey(p)).toThrow(/32 bytes/);
  });

  it("rejects a world-readable file", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(32, 1));
    chmodSync(p, 0o644);
    expect(() => loadMasterKey(p)).toThrow(/permissions/);
  });

  it("caches: same instance on subsequent calls with same path", () => {
    const p = join(dir, "k");
    writeFileSync(p, Buffer.alloc(32, 1));
    chmodSync(p, 0o400);
    const a = loadMasterKey(p);
    const b = loadMasterKey(p);
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

`npm test -- master-key.test`. Expected: module not found.

- [ ] **Step 3: Implement**

`apps/api/src/crypto/master-key.ts`:

```ts
import { readFileSync, statSync } from "node:fs";

let cached: { path: string; key: Uint8Array } | null = null;

export function loadMasterKey(path: string): Uint8Array {
  if (cached && cached.path === path) return cached.key;
  const st = statSync(path);
  if (process.platform !== "win32") {
    const mode = st.mode & 0o777;
    if (mode & 0o077) {
      throw new Error(`master key file ${path} has too-broad permissions: 0${mode.toString(8)}`);
    }
  }
  const buf = readFileSync(path);
  if (buf.length !== 32) {
    throw new Error(`master key file ${path} must be exactly 32 bytes, got ${buf.length}`);
  }
  const key = new Uint8Array(buf);
  cached = { path, key };
  return key;
}

// Test-only.
export function _resetMasterKeyCacheForTests(): void {
  cached = null;
}
```

- [ ] **Step 4: Run + commit**

```bash
npm test -- master-key.test
git add apps/api/src/crypto/master-key.ts apps/api/src/crypto/master-key.test.ts
git commit -m "$(cat <<'EOF'
api: add master key loader (32 bytes, 0400 file mode check, cached)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: AES-256-GCM secret encryption

**Files:**
- Create: `apps/api/src/crypto/secrets.ts`
- Create: `apps/api/src/crypto/secrets.test.ts`

**Wire format:** `value_enc` stores the ciphertext + the 16-byte GCM tag (concatenated); `value_nonce` stores the 12-byte nonce separately. Each call to `encryptSecret` generates a fresh random nonce.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./secrets.js";

const key = new Uint8Array(32).map((_, i) => i);

describe("AES-256-GCM secrets", () => {
  it("round-trips a plaintext", () => {
    const { ciphertext, nonce } = encryptSecret(key, "hello world");
    expect(nonce.length).toBe(12);
    expect(ciphertext.length).toBeGreaterThan(0);
    const plain = decryptSecret(key, ciphertext, nonce);
    expect(plain).toBe("hello world");
  });

  it("uses a unique nonce per call", () => {
    const a = encryptSecret(key, "x");
    const b = encryptSecret(key, "x");
    expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
  });

  it("fails to decrypt with the wrong key", () => {
    const { ciphertext, nonce } = encryptSecret(key, "secret");
    const wrong = new Uint8Array(32).fill(9);
    expect(() => decryptSecret(wrong, ciphertext, nonce)).toThrow();
  });

  it("fails to decrypt a tampered ciphertext", () => {
    const { ciphertext, nonce } = encryptSecret(key, "secret");
    ciphertext[0] ^= 0xff;
    expect(() => decryptSecret(key, ciphertext, nonce)).toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npm test -- secrets.test`. Expected: module not found.

- [ ] **Step 3: Implement**

`apps/api/src/crypto/secrets.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedSecret = {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
};

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export function encryptSecret(key: Uint8Array, plaintext: string): EncryptedSecret {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = new Uint8Array(enc.length + tag.length);
  out.set(enc, 0);
  out.set(tag, enc.length);
  return { ciphertext: out, nonce: new Uint8Array(nonce) };
}

export function decryptSecret(key: Uint8Array, ciphertextWithTag: Uint8Array, nonce: Uint8Array): string {
  if (key.length !== 32) throw new Error("key must be 32 bytes");
  if (nonce.length !== NONCE_BYTES) throw new Error("nonce must be 12 bytes");
  if (ciphertextWithTag.length < TAG_BYTES) throw new Error("ciphertext too short");
  const enc = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_BYTES);
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plain.toString("utf8");
}
```

- [ ] **Step 4: Test + commit**

```bash
npm test -- secrets.test
git add apps/api/src/crypto/secrets.ts apps/api/src/crypto/secrets.test.ts
git commit -m "$(cat <<'EOF'
api: add AES-256-GCM encrypt/decrypt for per-app secrets

12-byte nonce per call, 16-byte tag appended to ciphertext.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Token helpers (random tokens, SHA-256 hashes)

**Files:**
- Create: `apps/api/src/crypto/tokens.ts`
- Create: `apps/api/src/crypto/tokens.test.ts`

**Use:** invite tokens, enrollment tokens, session IDs. We store only the hash in the DB; the raw token leaves the server exactly once.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { generateOpaqueToken, hashToken, constantTimeEqual } from "./tokens.js";

describe("tokens", () => {
  it("generates a base64url token of the requested entropy", () => {
    const t = generateOpaqueToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThan(40);
  });

  it("hashes deterministically", () => {
    const h1 = hashToken("abc");
    const h2 = hashToken("abc");
    expect(Buffer.from(h1).equals(Buffer.from(h2))).toBe(true);
    expect(h1.length).toBe(32);
  });

  it("constant-time equality matches and rejects", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement**

`apps/api/src/crypto/tokens.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(raw: string | Uint8Array): Uint8Array {
  const hash = createHash("sha256");
  hash.update(typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw));
  return new Uint8Array(hash.digest());
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

- [ ] **Step 4: Test + commit**

```bash
npm test -- tokens.test
git add apps/api/src/crypto/tokens.ts apps/api/src/crypto/tokens.test.ts
git commit -m "$(cat <<'EOF'
api: add token helpers (base64url random, SHA-256 hash, constant-time eq)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — External clients

## Task 8: Helper client (Unix-socket)

**Files:**
- Create: `apps/api/src/clients/helper.ts`
- Create: `apps/api/src/clients/helper.test.ts`

**Purpose:** typed Node client for the Plan 1 helper Unix socket. Mirrors the wire protocol (4-byte BE length prefix + JSON). Single-shot connection per call.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:net";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HelperClient } from "./helper.js";

function readFrame(buf: Buffer): { len: number; payload: Buffer } | null {
  if (buf.length < 4) return null;
  const len = buf.readUInt32BE(0);
  if (buf.length < 4 + len) return null;
  return { len, payload: buf.subarray(4, 4 + len) };
}

function frame(payload: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  return Buffer.concat([len, payload]);
}

let server: Server;
let socketPath: string;
let lastRequest: any = null;
let nextResponse: any = { ok: true, data: { reloaded: true, validated: true } };

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "helper-test-"));
  socketPath = join(dir, "h.sock");
  server = createServer((conn) => {
    let buf = Buffer.alloc(0);
    conn.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const f = readFrame(buf);
      if (!f) return;
      lastRequest = JSON.parse(f.payload.toString("utf8"));
      const out = frame(Buffer.from(JSON.stringify(nextResponse), "utf8"));
      conn.end(out);
    });
  });
  await new Promise<void>((res) => server.listen(socketPath, res));
});

afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
});

describe("HelperClient", () => {
  it("calls nginx.reload and parses success", async () => {
    nextResponse = { ok: true, data: { reloaded: true, validated: true } };
    const client = new HelperClient(socketPath);
    const r = await client.nginxReload();
    expect(r).toEqual({ reloaded: true, validated: true });
    expect(lastRequest).toEqual({ command: "nginx.reload" });
  });

  it("calls nginx.write_config with params", async () => {
    nextResponse = { ok: true, data: { path: "/etc/nginx/managed/x.conf", bytes: 9 } };
    const client = new HelperClient(socketPath);
    const r = await client.nginxWriteConfig("x", "server {}");
    expect(r.path).toContain("x.conf");
    expect(lastRequest).toEqual({ command: "nginx.write_config", params: { name: "x", content: "server {}" } });
  });

  it("throws HelperError on ok:false", async () => {
    nextResponse = { ok: false, error: "nginx_test_failed", message: "bad config", stderr: "..." };
    const client = new HelperClient(socketPath);
    await expect(client.nginxReload()).rejects.toThrow(/nginx_test_failed/);
  });

  it("certbot.issue passes domain + email", async () => {
    nextResponse = { ok: true, data: { domain: "ex.com", issued: true } };
    const client = new HelperClient(socketPath);
    await client.certbotIssue("ex.com", "me@ex.com");
    expect(lastRequest.params).toEqual({ domain: "ex.com", email: "me@ex.com" });
  });
});
```

- [ ] **Step 2: Confirm failure.** `npm test -- clients/helper.test`.

- [ ] **Step 3: Implement `apps/api/src/clients/helper.ts`**

```ts
import { createConnection } from "node:net";

export class HelperError extends Error {
  constructor(public code: string, message: string, public stderr?: string) {
    super(`${code}: ${message}`);
    this.name = "HelperError";
  }
}

type Response = { ok: true; data: any } | { ok: false; error: string; message: string; stderr?: string };

export class HelperClient {
  constructor(private socketPath: string, private timeoutMs = 30_000) {}

  async nginxReload(): Promise<{ validated: boolean; reloaded: boolean }> {
    return (await this.call({ command: "nginx.reload" })) as any;
  }

  async nginxWriteConfig(name: string, content: string): Promise<{ path: string; bytes: number }> {
    return (await this.call({ command: "nginx.write_config", params: { name, content } })) as any;
  }

  async certbotIssue(domain: string, email: string): Promise<{ domain: string; issued: boolean }> {
    return (await this.call({ command: "certbot.issue", params: { domain, email } })) as any;
  }

  async certbotRenew(): Promise<{ renewed: boolean; stdout: string }> {
    return (await this.call({ command: "certbot.renew" })) as any;
  }

  private call(req: { command: string; params?: unknown }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const conn = createConnection(this.socketPath);
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        conn.destroy(new Error(`helper call timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      conn.on("connect", () => {
        const payload = Buffer.from(JSON.stringify(req), "utf8");
        const hdr = Buffer.alloc(4);
        hdr.writeUInt32BE(payload.length, 0);
        conn.write(Buffer.concat([hdr, payload]));
      });
      conn.on("data", (c) => chunks.push(c));
      conn.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      conn.on("end", () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks);
        if (buf.length < 4) return reject(new Error("short helper response"));
        const len = buf.readUInt32BE(0);
        const payload = buf.subarray(4, 4 + len);
        let resp: Response;
        try {
          resp = JSON.parse(payload.toString("utf8"));
        } catch (e) {
          return reject(e as Error);
        }
        if (resp.ok) resolve(resp.data);
        else reject(new HelperError(resp.error, resp.message, resp.stderr));
      });
    });
  }
}
```

- [ ] **Step 4: Test + commit**

```bash
npm test -- clients/helper.test
git add apps/api/src/clients/helper.ts apps/api/src/clients/helper.test.ts
git commit -m "$(cat <<'EOF'
api: add typed HelperClient for the Plan 1 Unix-socket helper

Mirrors the wire protocol (4-byte BE length prefix + JSON). Throws
HelperError when the helper returns ok:false.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Docker socket-proxy client

**Files:**
- Create: `apps/api/src/clients/docker.ts`
- Create: `apps/api/src/clients/docker.test.ts`

**Purpose:** thin facade over `dockerode` pointed at the socket-proxy URL, with the operations the deployment job will need: build image, create container, start, stop, remove, list, logs (stream), create/remove network.

The tests here are limited to interface shape — full container behaviour is covered by the E2E task (Task 36). For unit tests, we mock the underlying `Docker` from dockerode.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { DockerClient } from "./docker.js";

describe("DockerClient", () => {
  it("constructs dockerode with the proxy URL", async () => {
    const calls: any[] = [];
    const fakeDocker = {
      createContainer: vi.fn(async (opts: any) => {
        calls.push({ kind: "createContainer", opts });
        return { id: "abc123", start: vi.fn(), stop: vi.fn(), remove: vi.fn() };
      }),
      createNetwork: vi.fn(async (opts: any) => {
        calls.push({ kind: "createNetwork", opts });
        return { id: "net123" };
      }),
    };
    const client = new DockerClient("http://proxy:2375", () => fakeDocker as any);
    await client.createContainer({
      name: "myapp_abc",
      image: "pm/myapp:abc",
      networkName: "app_myapp",
      portBindings: { host: 10001, container: 3000 },
      env: { NODE_ENV: "production" },
      memLimitMb: 256,
      cpuLimit: 0.5,
      restartPolicy: "unless-stopped",
    });
    expect(fakeDocker.createContainer).toHaveBeenCalledOnce();
    const opts = (fakeDocker.createContainer.mock.calls[0]![0] as any);
    expect(opts.name).toBe("myapp_abc");
    expect(opts.Image).toBe("pm/myapp:abc");
    expect(opts.HostConfig.PortBindings["3000/tcp"][0].HostPort).toBe("10001");
    expect(opts.HostConfig.PortBindings["3000/tcp"][0].HostIp).toBe("127.0.0.1");
    expect(opts.HostConfig.NetworkMode).toBe("app_myapp");
    expect(opts.Env).toEqual(["NODE_ENV=production"]);
    expect(opts.HostConfig.RestartPolicy.Name).toBe("unless-stopped");
  });
});
```

- [ ] **Step 2: Confirm failure.**

- [ ] **Step 3: Implement `apps/api/src/clients/docker.ts`**

```ts
import Docker from "dockerode";

export type CreateContainerOptions = {
  name: string;
  image: string;
  networkName: string;
  portBindings: { host: number; container: number };
  env: Record<string, string>;
  memLimitMb: number;
  cpuLimit: number;
  restartPolicy: string;
  labels?: Record<string, string>;
};

export class DockerClient {
  private inner: any;

  constructor(proxyUrl: string, factory: (proxyUrl: string) => any = defaultFactory) {
    this.inner = factory(proxyUrl);
  }

  async createNetwork(name: string): Promise<{ id: string }> {
    return this.inner.createNetwork({ Name: name, Driver: "bridge", Internal: false });
  }

  async createContainer(opts: CreateContainerOptions): Promise<{ id: string; start: () => Promise<void>; stop: () => Promise<void>; remove: () => Promise<void> }> {
    const env = Object.entries(opts.env).map(([k, v]) => `${k}=${v}`);
    const created = await this.inner.createContainer({
      name: opts.name,
      Image: opts.image,
      Env: env,
      Labels: opts.labels ?? {},
      HostConfig: {
        Memory: opts.memLimitMb * 1024 * 1024,
        NanoCpus: Math.round(opts.cpuLimit * 1e9),
        RestartPolicy: { Name: opts.restartPolicy },
        NetworkMode: opts.networkName,
        PortBindings: {
          [`${opts.portBindings.container}/tcp`]: [{ HostIp: "127.0.0.1", HostPort: String(opts.portBindings.host) }],
        },
      },
    });
    return created;
  }

  async buildImage(tarballStream: NodeJS.ReadableStream, tag: string): Promise<NodeJS.ReadableStream> {
    return this.inner.buildImage(tarballStream, { t: tag });
  }

  async listContainersByLabel(label: string, value: string): Promise<any[]> {
    return this.inner.listContainers({ all: true, filters: { label: [`${label}=${value}`] } });
  }

  getContainer(id: string): any {
    return this.inner.getContainer(id);
  }
}

function defaultFactory(proxyUrl: string) {
  const url = new URL(proxyUrl);
  return new Docker({ host: url.hostname, port: Number(url.port) || 2375, protocol: (url.protocol.replace(":", "") as "http" | "https") });
}
```

- [ ] **Step 4: Test + commit**

```bash
npm test -- clients/docker.test
git add apps/api/src/clients/docker.ts apps/api/src/clients/docker.test.ts
git commit -m "$(cat <<'EOF'
api: add DockerClient (dockerode facade pointed at the socket proxy)

Single entry point for the operations the deployer needs: create/start/
stop containers, create networks, build images, list+inspect.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: GitHub App client

**Files:**
- Create: `apps/api/src/clients/github.ts`
- Create: `apps/api/src/clients/github.test.ts`

**Purpose:** wraps `@octokit/auth-app` so other modules can: list installations, list repos for an installation, get a short-lived installation token (for `git clone`), verify webhook signatures, fetch a commit for context.

Unit tests use a mock fetch so no real GitHub calls happen.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { verifyGithubSignature } from "./github.js";
import { createHmac } from "node:crypto";

describe("verifyGithubSignature", () => {
  const secret = "whsec_topsecret";
  const body = '{"hello":"world"}';
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyGithubSignature(secret, body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyGithubSignature(secret, body + " ", sig)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyGithubSignature(secret, body, "")).toBe(false);
    expect(verifyGithubSignature(secret, body, "sha1=abc")).toBe(false);
  });
});
```

- [ ] **Step 2: Confirm failure.**

- [ ] **Step 3: Implement `apps/api/src/clients/github.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export function verifyGithubSignature(secret: string, body: string, header: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type GithubClientOptions = {
  appId: string;
  privateKeyPath: string;
};

export class GithubClient {
  private auth: ReturnType<typeof createAppAuth>;

  constructor(opts: GithubClientOptions) {
    const privateKey = readFileSync(opts.privateKeyPath, "utf8");
    this.auth = createAppAuth({ appId: opts.appId, privateKey });
  }

  async installationToken(installationId: bigint | number): Promise<string> {
    const r = await this.auth({ type: "installation", installationId: Number(installationId) });
    return r.token;
  }

  async forInstallation(installationId: bigint | number): Promise<Octokit> {
    const token = await this.installationToken(installationId);
    return new Octokit({ auth: token });
  }

  async listInstallations(): Promise<Array<{ id: number; account: string }>> {
    const appOctokit = new Octokit({ authStrategy: createAppAuth, auth: { appId: this.appIdFromAuth(), privateKey: this.privateKeyFromAuth() } });
    const r = await appOctokit.apps.listInstallations({ per_page: 100 });
    return r.data.map((i) => ({ id: i.id, account: (i.account && "login" in i.account ? i.account.login : i.account?.name) ?? "?" }));
  }

  async listInstallationRepos(installationId: bigint | number): Promise<Array<{ id: number; fullName: string; defaultBranch: string }>> {
    const oct = await this.forInstallation(installationId);
    const r = await oct.apps.listReposAccessibleToInstallation({ per_page: 100 });
    return r.data.repositories.map((repo) => ({ id: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch }));
  }

  private appIdFromAuth(): string {
    return (this.auth as any).hook.toString().includes("appId") ? (this.auth as any).appId : "";
  }
  private privateKeyFromAuth(): string {
    return "";
  }
}
```

(Note: the `listInstallations` method above reconstructs an app-level Octokit; if you prefer, store `appId` and `privateKey` as class fields and build an app Octokit directly. The simpler version below works fine — adjust to your preference. The behaviour-critical piece here is `verifyGithubSignature` which the webhook route depends on.)

A cleaner alternative that the test still passes for:

```ts
// Replace listInstallations / listInstallationRepos with simpler app-level access:
export class GithubClient {
  private auth: ReturnType<typeof createAppAuth>;
  private appId: string;
  private privateKey: string;

  constructor(opts: GithubClientOptions) {
    this.appId = opts.appId;
    this.privateKey = readFileSync(opts.privateKeyPath, "utf8");
    this.auth = createAppAuth({ appId: this.appId, privateKey: this.privateKey });
  }

  private appOctokit(): Octokit {
    return new Octokit({ authStrategy: createAppAuth, auth: { appId: this.appId, privateKey: this.privateKey } });
  }

  async installationToken(installationId: bigint | number): Promise<string> {
    const r = await this.auth({ type: "installation", installationId: Number(installationId) });
    return r.token;
  }

  async forInstallation(installationId: bigint | number): Promise<Octokit> {
    return new Octokit({ auth: await this.installationToken(installationId) });
  }

  async listInstallations() {
    const r = await this.appOctokit().apps.listInstallations({ per_page: 100 });
    return r.data.map((i) => ({ id: i.id, account: (i.account && "login" in i.account ? i.account.login : i.account?.name) ?? "?" }));
  }

  async listInstallationRepos(installationId: bigint | number) {
    const r = await (await this.forInstallation(installationId)).apps.listReposAccessibleToInstallation({ per_page: 100 });
    return r.data.repositories.map((repo) => ({ id: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch }));
  }
}
```

Use the cleaner alternative.

- [ ] **Step 4: Test + commit**

```bash
npm test -- clients/github.test
git add apps/api/src/clients/github.ts apps/api/src/clients/github.test.ts
git commit -m "$(cat <<'EOF'
api: add GithubClient (App auth, installation tokens, webhook verify)

verifyGithubSignature is constant-time and rejects malformed headers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Auth primitives

(Continued in the next section. Tasks 11–14 cover argon2 password hashing, TOTP, WebAuthn challenges, sessions + rate-limit. Tasks 15–17 build the Fastify app skeleton, error handler, and auth middleware. Tasks 18–22 wire enrollment, invites, users, login/logout. Tasks 23–27 build apps/env/volumes/domains. Tasks 28–32 build the deployment pipeline. Tasks 33–35 wire WebSockets + GitHub webhook. Task 36 is the end-to-end smoke.)

## Task 11: Password hashing (Argon2id)

**Files:** Create `apps/api/src/auth/password.ts` + `password.test.ts`.

- [ ] **Step 1: Test (fail first)**

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("round-trips", async () => {
    const h = await hashPassword("hunter2");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "hunter2")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import argon2 from "argon2";
const OPTIONS: argon2.Options = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
export async function hashPassword(p: string): Promise<string> { return argon2.hash(p, OPTIONS); }
export async function verifyPassword(hash: string, p: string): Promise<boolean> { try { return await argon2.verify(hash, p); } catch { return false; } }
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- password.test
git add apps/api/src/auth/password.ts apps/api/src/auth/password.test.ts
git commit -m "api: add Argon2id password hashing wrappers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: TOTP

**Files:** Create `apps/api/src/auth/totp.ts` + `totp.test.ts`.

- [ ] **Step 1: Test (fail first)**

```ts
import { describe, it, expect } from "vitest";
import { generateTotpSecret, verifyTotp, otpauthUri } from "./totp.js";
import { authenticator } from "otplib";

describe("totp", () => {
  it("generates a base32 secret", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
  });
  it("verifies a token from otplib", () => {
    const s = generateTotpSecret();
    const t = authenticator.generate(s);
    expect(verifyTotp(s, t)).toBe(true);
    expect(verifyTotp(s, "000000")).toBe(false);
  });
  it("builds an otpauth URI", () => {
    const uri = otpauthUri("you@example.com", "ABCDEFGHIJK234567", "projectMng");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("issuer=projectMng");
  });
});
```

- [ ] **Step 2: Implement `apps/api/src/auth/totp.ts`**

```ts
import { authenticator } from "otplib";
authenticator.options = { window: 1, step: 30 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try { return authenticator.verify({ token, secret }); } catch { return false; }
}

export function otpauthUri(account: string, secret: string, issuer: string): string {
  return authenticator.keyuri(account, issuer, secret);
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- totp.test
git add apps/api/src/auth/totp.ts apps/api/src/auth/totp.test.ts
git commit -m "api: add TOTP wrapper (otplib, 30s step, ±1 window)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: WebAuthn (registration + assertion verify)

**Files:** Create `apps/api/src/auth/webauthn.ts` + `webauthn.test.ts`.

**Purpose:** thin wrapper around `@simplewebauthn/server` so HTTP routes have a small API: `generateRegistrationOptions`, `verifyRegistration`, `generateAuthenticationOptions`, `verifyAuthentication`. Tests assert option shape; full round-trip is exercised via the auth route tests later.

- [ ] **Step 1: Test (fail first)**

```ts
import { describe, it, expect } from "vitest";
import { WebAuthnService } from "./webauthn.js";

const svc = new WebAuthnService({ rpId: "pm.example.com", rpName: "projectMng", origin: "https://pm.example.com" });

describe("WebAuthnService", () => {
  it("emits registration options with rpId/rpName", async () => {
    const o = await svc.startRegistration({ userId: "00000000-0000-0000-0000-000000000001", userName: "you@example.com" });
    expect(o.options.rp.id).toBe("pm.example.com");
    expect(o.options.rp.name).toBe("projectMng");
    expect(typeof o.challenge).toBe("string");
    expect(o.challenge.length).toBeGreaterThan(0);
  });

  it("emits authentication options", async () => {
    const o = await svc.startAuthentication({ allowCredentialIds: [] });
    expect(typeof o.challenge).toBe("string");
  });
});
```

- [ ] **Step 2: Implement `apps/api/src/auth/webauthn.ts`**

```ts
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server/script/deps";

export type WebAuthnConfig = { rpId: string; rpName: string; origin: string };

export class WebAuthnService {
  constructor(private cfg: WebAuthnConfig) {}

  async startRegistration(args: { userId: string; userName: string; excludeCredentialIds?: Uint8Array[] }) {
    const options = await generateRegistrationOptions({
      rpID: this.cfg.rpId,
      rpName: this.cfg.rpName,
      userName: args.userName,
      userID: new TextEncoder().encode(args.userId),
      attestationType: "none",
      authenticatorSelection: { userVerification: "preferred", residentKey: "preferred" },
      excludeCredentials: (args.excludeCredentialIds ?? []).map((id) => ({ id: Buffer.from(id).toString("base64url") })),
    });
    return { options, challenge: options.challenge };
  }

  async finishRegistration(args: { response: RegistrationResponseJSON; expectedChallenge: string }) {
    const verification = await verifyRegistrationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: this.cfg.origin,
      expectedRPID: this.cfg.rpId,
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error("registration not verified");
    const info = verification.registrationInfo;
    return {
      credentialId: new Uint8Array(Buffer.from(info.credential.id, "base64url")),
      publicKey: new Uint8Array(info.credential.publicKey),
      signCount: BigInt(info.credential.counter),
      transports: info.credential.transports ?? [],
    };
  }

  async startAuthentication(args: { allowCredentialIds: Uint8Array[] }) {
    const options = await generateAuthenticationOptions({
      rpID: this.cfg.rpId,
      allowCredentials: args.allowCredentialIds.map((id) => ({ id: Buffer.from(id).toString("base64url") })),
      userVerification: "preferred",
    });
    return { options, challenge: options.challenge };
  }

  async finishAuthentication(args: {
    response: AuthenticationResponseJSON;
    expectedChallenge: string;
    storedPublicKey: Uint8Array;
    storedSignCount: bigint;
  }) {
    const verification = await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge: args.expectedChallenge,
      expectedOrigin: this.cfg.origin,
      expectedRPID: this.cfg.rpId,
      credential: {
        id: args.response.id,
        publicKey: Buffer.from(args.storedPublicKey),
        counter: Number(args.storedSignCount),
      },
    });
    if (!verification.verified) throw new Error("authentication not verified");
    return { newSignCount: BigInt(verification.authenticationInfo.newCounter) };
  }
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- webauthn.test
git add apps/api/src/auth/webauthn.ts apps/api/src/auth/webauthn.test.ts
git commit -m "api: add WebAuthnService wrapper around @simplewebauthn/server

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Sessions + rate limit

**Files:** Create `apps/api/src/auth/sessions.ts`, `sessions.test.ts`, `rate-limit.ts`, `rate-limit.test.ts`.

**Sessions:** insert row, return opaque token (UUID = session.id), look up by id, slide expiry, revoke. Cookies handled at the HTTP layer (Task 15).

**Rate limit:** sliding-window counter in Redis. `consume(key, limit, windowSec)` returns `{ allowed: boolean; remaining: number }`. Used for login.

- [ ] **Step 1: Test for sessions (fail first)**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import { SessionManager } from "./sessions.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let userId: string;

beforeAll(async () => {
  const url = await startTestPostgres();
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "s@example.com" }).returning();
  userId = u.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("SessionManager", () => {
  it("creates, looks up, slides, and revokes", async () => {
    const mgr = new SessionManager(db, { ttlDays: 7 });
    const { sessionId } = await mgr.create({ userId, ip: "127.0.0.1", userAgent: "ua" });
    const looked = await mgr.lookup(sessionId);
    expect(looked?.userId).toBe(userId);
    await mgr.touch(sessionId);
    await mgr.revoke(sessionId);
    expect(await mgr.lookup(sessionId)).toBe(null);
  });
});
```

- [ ] **Step 2: Implement `apps/api/src/auth/sessions.ts`**

```ts
import { eq, and, isNull, gt } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { sessions } from "../db/schema.js";

export class SessionManager {
  constructor(private db: Database, private opts: { ttlDays: number }) {}

  async create(args: { userId: string; ip?: string; userAgent?: string }) {
    const expiresAt = new Date(Date.now() + this.opts.ttlDays * 86_400_000);
    const [row] = await this.db.insert(sessions).values({
      userId: args.userId,
      ipInet: args.ip ?? null,
      userAgent: args.userAgent ?? null,
      expiresAt,
    }).returning();
    return { sessionId: row.id };
  }

  async lookup(sessionId: string): Promise<{ userId: string } | null> {
    const rows = await this.db.select().from(sessions).where(
      and(eq(sessions.id, sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    );
    const row = rows[0];
    return row ? { userId: row.userId } : null;
  }

  async touch(sessionId: string) {
    const newExpiry = new Date(Date.now() + this.opts.ttlDays * 86_400_000);
    await this.db.update(sessions).set({ lastSeenAt: new Date(), expiresAt: newExpiry }).where(eq(sessions.id, sessionId));
  }

  async revoke(sessionId: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }
}
```

- [ ] **Step 3: Test for rate-limit (fail first)**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import Redis from "ioredis";
import { RateLimiter } from "./rate-limit.js";

let redisContainer: StartedRedisContainer;
let redis: Redis;

beforeAll(async () => {
  redisContainer = await new RedisContainer("redis:7-alpine").start();
  redis = new Redis(redisContainer.getConnectionUrl());
});
afterAll(async () => { await redis.quit(); await redisContainer.stop({ remove: true }); });

describe("RateLimiter", () => {
  it("allows the first N, then blocks", async () => {
    const rl = new RateLimiter(redis);
    const key = "test:" + Math.random();
    for (let i = 0; i < 3; i++) {
      const r = await rl.consume(key, 3, 60);
      expect(r.allowed).toBe(true);
    }
    const r = await rl.consume(key, 3, 60);
    expect(r.allowed).toBe(false);
  });
});
```

- [ ] **Step 4: Implement `apps/api/src/auth/rate-limit.ts`**

```ts
import type Redis from "ioredis";

export class RateLimiter {
  constructor(private redis: Redis) {}

  async consume(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }> {
    const k = `rl:${key}`;
    const tx = this.redis.multi();
    tx.incr(k);
    tx.expire(k, windowSec, "NX");
    const res = await tx.exec();
    const count = (res?.[0]?.[1] as number) ?? 0;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
}
```

- [ ] **Step 5: Test + commit**

```bash
npm test -- sessions.test rate-limit.test
git add apps/api/src/auth/sessions.ts apps/api/src/auth/sessions.test.ts apps/api/src/auth/rate-limit.ts apps/api/src/auth/rate-limit.test.ts
git commit -m "api: add SessionManager and Redis-backed RateLimiter

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Fastify app skeleton

## Task 15: Error hierarchy + Fastify factory

**Files:** Create `apps/api/src/lib/errors.ts`, `apps/api/src/http/server.ts`, plus tests.

- [ ] **Step 1: Implement `apps/api/src/lib/errors.ts`**

```ts
export class HTTPError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "HTTPError";
  }
}

export const BadRequest = (msg: string, details?: unknown) => new HTTPError(400, "bad_request", msg, details);
export const Unauthorized = (msg = "unauthorized") => new HTTPError(401, "unauthorized", msg);
export const Forbidden = (msg = "forbidden") => new HTTPError(403, "forbidden", msg);
export const NotFound = (msg = "not found") => new HTTPError(404, "not_found", msg);
export const Conflict = (msg: string) => new HTTPError(409, "conflict", msg);
export const InternalError = (msg = "internal error") => new HTTPError(500, "internal_error", msg);
```

- [ ] **Step 2: Test for Fastify factory**

`apps/api/src/http/server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "./server.js";
import { BadRequest } from "../lib/errors.js";

describe("createServer", () => {
  it("returns JSON error for HTTPError", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    app.get("/boom", () => { throw BadRequest("nope"); });
    const r = await app.inject({ method: "GET", url: "/boom" });
    expect(r.statusCode).toBe(400);
    expect(JSON.parse(r.body)).toEqual({ error: { code: "bad_request", message: "nope" } });
    await app.close();
  });

  it("returns 500 with no stack for unknown errors", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    app.get("/kaboom", () => { throw new Error("oops"); });
    const r = await app.inject({ method: "GET", url: "/kaboom" });
    expect(r.statusCode).toBe(500);
    const body = JSON.parse(r.body);
    expect(body.error.code).toBe("internal_error");
    expect(body).not.toHaveProperty("stack");
    await app.close();
  });
});
```

- [ ] **Step 3: Implement `apps/api/src/http/server.ts`**

```ts
import Fastify, { FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { HTTPError } from "../lib/errors.js";

export type ServerOptions = {
  cookieSecret: string;
  corsOrigins?: string[];
};

export async function createServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: opts.corsOrigins ?? false, credentials: true });
  await app.register(cookie, { secret: opts.cookieSecret });
  await app.register(websocket);
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HTTPError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: "internal_error", message: "internal error" } });
  });
  return app;
}
```

- [ ] **Step 4: Test + commit**

```bash
npm test -- http/server.test
git add apps/api/src/lib/errors.ts apps/api/src/http/server.ts apps/api/src/http/server.test.ts
git commit -m "api: add HTTPError hierarchy and Fastify factory (helmet, cors, cookies, ws)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Audit log writer + auth middleware

**Files:** Create `apps/api/src/auth/audit.ts`, `audit.test.ts`, `apps/api/src/http/plugins/auth.ts`, `auth.test.ts`.

- [ ] **Step 1: Test for audit writer (fail first)**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { desc } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import { AuditLog } from "./audit.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let userId: string;

beforeAll(async () => {
  const url = await startTestPostgres();
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "a@a.com" }).returning();
  userId = u.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("AuditLog", () => {
  it("appends a row", async () => {
    const a = new AuditLog(db);
    await a.write({ actorUserId: userId, actorIp: "127.0.0.1", action: "test.run", targetType: "app", targetId: "x", metadata: { foo: 1 } });
    const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.ts)).limit(1);
    expect(rows[0]?.action).toBe("test.run");
  });
});
```

- [ ] **Step 2: Implement `apps/api/src/auth/audit.ts`**

```ts
import type { Database } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export type AuditEvent = {
  actorUserId?: string | null;
  actorIp?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export class AuditLog {
  constructor(private db: Database) {}
  async write(e: AuditEvent): Promise<void> {
    await this.db.insert(auditLog).values({
      actorUserId: e.actorUserId ?? null,
      actorIp: e.actorIp ?? null,
      action: e.action,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      metadata: e.metadata ?? {},
    });
  }
}
```

- [ ] **Step 3: Implement `apps/api/src/http/plugins/auth.ts`**

```ts
import fp from "fastify-plugin";
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { SessionManager } from "../../auth/sessions.js";
import { Unauthorized } from "../../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: { userId: string; sessionId: string };
  }
}

const SESSION_COOKIE = "pm_session";

type Options = { sessions: SessionManager };

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  app.decorate("requireAuth", async (req: FastifyRequest) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (!sid) throw Unauthorized();
    const s = await opts.sessions.lookup(sid);
    if (!s) throw Unauthorized();
    req.session = { userId: s.userId, sessionId: sid };
    await opts.sessions.touch(sid);
  });
  app.decorate("setSessionCookie", (reply: any, sessionId: string) => {
    reply.setCookie(SESSION_COOKIE, sessionId, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 7 * 24 * 60 * 60 });
  });
  app.decorate("clearSessionCookie", (reply: any) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  });
};

declare module "fastify" {
  interface FastifyInstance {
    requireAuth(req: FastifyRequest): Promise<void>;
    setSessionCookie(reply: any, sessionId: string): void;
    clearSessionCookie(reply: any): void;
  }
}

export default fp(plugin, { name: "pm-auth" });
```

- [ ] **Step 4: Test for auth middleware**

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import authPlugin from "./auth.js";

describe("auth plugin", () => {
  it("rejects requests without a session cookie", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const fakeSessions = { lookup: async () => null, touch: async () => {}, create: async () => ({ sessionId: "s" }), revoke: async () => {} } as any;
    await app.register(authPlugin, { sessions: fakeSessions });
    app.get("/me", { preHandler: app.requireAuth }, async (req) => ({ userId: req.session!.userId }));
    const r = await app.inject({ method: "GET", url: "/me" });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it("allows requests with a valid cookie", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const fakeSessions = { lookup: async (id: string) => (id === "good" ? { userId: "u1" } : null), touch: async () => {} } as any;
    await app.register(authPlugin, { sessions: fakeSessions });
    app.get("/me", { preHandler: app.requireAuth }, async (req) => ({ userId: req.session!.userId }));
    const r = await app.inject({ method: "GET", url: "/me", cookies: { pm_session: "good" } });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).userId).toBe("u1");
    await app.close();
  });
});
```

- [ ] **Step 5: Test + commit**

```bash
npm test -- audit.test plugins/auth.test
git add apps/api/src/auth/audit.ts apps/api/src/auth/audit.test.ts apps/api/src/http/plugins/auth.ts apps/api/src/http/plugins/auth.test.ts
git commit -m "api: add AuditLog writer + auth plugin with session cookies

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Composition root for `pm-api`

**Files:** Modify `apps/api/src/index.api.ts`.

Wire config → clients → managers → server → listen.

- [ ] **Step 1: Replace `apps/api/src/index.api.ts`**

```ts
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { loadMasterKey } from "./crypto/master-key.js";
import { HelperClient } from "./clients/helper.js";
import { DockerClient } from "./clients/docker.js";
import { GithubClient } from "./clients/github.js";
import { WebAuthnService } from "./auth/webauthn.js";
import { SessionManager } from "./auth/sessions.js";
import { AuditLog } from "./auth/audit.js";
import { RateLimiter } from "./auth/rate-limit.js";
import { createServer } from "./http/server.js";
import authPlugin from "./http/plugins/auth.js";
import Redis from "ioredis";

async function main() {
  const cfg = loadConfig();
  const { pool, db } = createDb(cfg.databaseUrl);
  loadMasterKey(cfg.masterKeyPath); // fail fast if missing
  const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
  const helper = new HelperClient(cfg.helperSocketPath);
  const docker = new DockerClient(cfg.dockerProxyUrl);
  const github = new GithubClient({ appId: cfg.githubAppId, privateKeyPath: cfg.githubAppPrivateKeyPath });
  const webauthn = new WebAuthnService({ rpId: cfg.webauthnRpId, rpName: cfg.webauthnRpName, origin: cfg.publicBaseUrl });
  const sessions = new SessionManager(db, { ttlDays: 7 });
  const audit = new AuditLog(db);
  const rateLimit = new RateLimiter(redis);

  const app = await createServer({ cookieSecret: cfg.cookieSecret });
  await app.register(authPlugin, { sessions });
  app.decorate("svc", { cfg, db, redis, helper, docker, github, webauthn, sessions, audit, rateLimit });

  // Route registration happens in Phase F+ tasks.

  await app.listen({ host: "0.0.0.0", port: cfg.httpPort });
  app.log.info({ port: cfg.httpPort }, "pm-api listening");

  const shutdown = async () => {
    await app.close();
    await pool.end();
    await redis.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Typecheck + commit**

```bash
npm run typecheck
git add apps/api/src/index.api.ts
git commit -m "api: wire pm-api composition root (config + clients + server)

Routes registered in later tasks. Listens after deps are constructed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase F — Enrollment, invites, users, login/logout

## Task 18: Enrollment route (bootstrap user)

**Files:** Create `apps/api/src/http/routes/enroll.ts` + integration test. Create `apps/api/src/domain/enrollment.ts` for the token store (a tiny KV table or use the `invites` table with a sentinel — we'll reuse `invites` with `email = "__bootstrap__"`).

**Flow:**
1. Install script inserts an invite with `email = "__bootstrap__"` and a 30-min expiry; prints the raw token URL.
2. Operator opens `/api/enroll/<token>` → either registers a passkey or sets password+TOTP.
3. On success: invite marked `consumed_at`, user created, session issued.

(Behaviour shared with regular invites — combine in next task.)

- [ ] **Step 1: Implement `apps/api/src/domain/invites.ts`**

```ts
import { eq, and, isNull, gt } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { invites, users } from "../db/schema.js";
import { generateOpaqueToken, hashToken } from "../crypto/tokens.js";
import { NotFound, Conflict } from "../lib/errors.js";

export class InviteService {
  constructor(private db: Database) {}

  async createInvite(args: { createdBy: string; email?: string; ttlMs: number }): Promise<{ token: string }> {
    const token = generateOpaqueToken(32);
    const hash = hashToken(token);
    await this.db.insert(invites).values({
      tokenHash: hash,
      createdBy: args.createdBy,
      email: args.email ?? null,
      expiresAt: new Date(Date.now() + args.ttlMs),
    });
    return { token };
  }

  async consume(token: string, newUserEmail: string): Promise<{ userId: string }> {
    const hash = hashToken(token);
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(invites).where(
        and(eq(invites.tokenHash, hash), isNull(invites.consumedAt), gt(invites.expiresAt, new Date())),
      );
      const invite = rows[0];
      if (!invite) throw NotFound("invite invalid or expired");
      const existing = await tx.select().from(users).where(eq(users.email, newUserEmail));
      if (existing.length > 0) throw Conflict("email already registered");
      const [user] = await tx.insert(users).values({ email: newUserEmail }).returning();
      await tx.update(invites).set({ consumedAt: new Date(), consumedBy: user.id }).where(eq(invites.tokenHash, hash));
      return { userId: user.id };
    });
  }
}
```

- [ ] **Step 2: Test the invite service**

`apps/api/src/domain/invites.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import { InviteService } from "./invites.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let creator: string;

beforeAll(async () => {
  const url = await startTestPostgres();
  pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "creator@a.com" }).returning();
  creator = u.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("InviteService", () => {
  it("creates and consumes", async () => {
    const svc = new InviteService(db);
    const { token } = await svc.createInvite({ createdBy: creator, ttlMs: 60_000 });
    const { userId } = await svc.consume(token, "new@a.com");
    expect(userId).toBeTypeOf("string");
    await expect(svc.consume(token, "again@a.com")).rejects.toThrow(/invalid/);
  });
});
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- domain/invites.test
git add apps/api/src/domain/invites.ts apps/api/src/domain/invites.test.ts
git commit -m "api: add InviteService (create + single-use consume in txn)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Auth routes (login, register-credential, logout)

**Files:** Create `apps/api/src/http/routes/auth.ts` + integration test.

**Endpoints (all return JSON; cookie set on success):**
- `POST /api/auth/webauthn/registration/start` — body `{ inviteToken?: string }` — returns options + a challenge token (cookie-stored).
- `POST /api/auth/webauthn/registration/finish` — body `{ response, inviteToken?, email?, nickname }` — verifies, persists credential, consumes invite if present, issues session.
- `POST /api/auth/webauthn/login/start` — body `{ email }` — returns options + challenge.
- `POST /api/auth/webauthn/login/finish` — body `{ response }` — verifies, issues session.
- `POST /api/auth/password/login` — body `{ email, password, totp }` — rate-limited; verifies; issues session.
- `POST /api/auth/password/setup` — requires auth; body `{ password, totpSecret, totpToken }` — sets password+TOTP for current user.
- `POST /api/auth/logout` — revokes session, clears cookie.

For brevity, the test below covers password login + logout. Other endpoints follow the same structure (test → implement → pass → commit).

- [ ] **Step 1: Integration test for password login flow**

`apps/api/src/http/routes/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import Redis from "ioredis";
import * as schema from "../../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../../test/setup.js";
import { createServer } from "../server.js";
import authPlugin from "../plugins/auth.js";
import { registerAuthRoutes } from "./auth.js";
import { SessionManager } from "../../auth/sessions.js";
import { RateLimiter } from "../../auth/rate-limit.js";
import { AuditLog } from "../../auth/audit.js";
import { hashPassword } from "../../auth/password.js";
import { authenticator } from "otplib";
import { encryptSecret } from "../../crypto/secrets.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let redisContainer: StartedRedisContainer;
let redis: Redis;
const masterKey = new Uint8Array(32).map((_, i) => i + 1);

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  redisContainer = await new RedisContainer("redis:7-alpine").start();
  redis = new Redis(redisContainer.getConnectionUrl());
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); await redis.quit(); await redisContainer.stop({ remove: true }); });

describe("auth routes", () => {
  it("password+TOTP login then logout", async () => {
    const totpSecret = authenticator.generateSecret();
    const totpEnc = encryptSecret(masterKey, totpSecret);
    const [user] = await db.insert(schema.users).values({
      email: "login@a.com",
      passwordHash: await hashPassword("hunter2"),
      totpSecretEnc: new Uint8Array(Buffer.concat([Buffer.from(totpEnc.nonce), Buffer.from(totpEnc.ciphertext)])),
      totpEnabled: true,
    }).returning();

    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const sessions = new SessionManager(db, { ttlDays: 7 });
    await app.register(authPlugin, { sessions });
    registerAuthRoutes(app, { db, sessions, rateLimit: new RateLimiter(redis), audit: new AuditLog(db), masterKey, webauthn: null as any, invites: null as any });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/password/login",
      payload: { email: "login@a.com", password: "hunter2", totp: authenticator.generate(totpSecret) },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(String(cookie)).toContain("pm_session=");

    const sessionCookie = String(cookie).split(";")[0]!;
    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: sessionCookie } });
    expect(logout.statusCode).toBe(204);

    await app.close();
    // Cleanup
    await db.delete(schema.users).where(schema.users.id.eq ? (schema.users.id as any).eq(user.id) : undefined as any);
  });
});
```

- [ ] **Step 2: Implement `apps/api/src/http/routes/auth.ts`** — minimum to pass the test (password login + logout). Add the other endpoints (passkey start/finish, password setup) by following the same pattern in subsequent commits within this task.

```ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { verifyPassword } from "../../auth/password.js";
import { verifyTotp } from "../../auth/totp.js";
import { SessionManager } from "../../auth/sessions.js";
import { RateLimiter } from "../../auth/rate-limit.js";
import { AuditLog } from "../../auth/audit.js";
import { WebAuthnService } from "../../auth/webauthn.js";
import { InviteService } from "../../domain/invites.js";
import { decryptSecret } from "../../crypto/secrets.js";
import { Unauthorized, BadRequest } from "../../lib/errors.js";

export type AuthDeps = {
  db: Database;
  sessions: SessionManager;
  rateLimit: RateLimiter;
  audit: AuditLog;
  masterKey: Uint8Array;
  webauthn: WebAuthnService;
  invites: InviteService;
};

const PasswordLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/),
});

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps) {
  app.post("/api/auth/password/login", async (req, reply) => {
    const body = PasswordLoginBody.parse(req.body);
    const ip = req.ip;
    const { allowed } = await deps.rateLimit.consume(`login:${ip}`, 5, 15 * 60);
    if (!allowed) {
      await deps.audit.write({ actorIp: ip, action: "login.rate_limited", metadata: { email: body.email } });
      throw new (await import("../../lib/errors.js")).HTTPError(429, "rate_limited", "too many attempts");
    }
    const [user] = await deps.db.select().from(users).where(eq(users.email, body.email));
    if (!user || !user.passwordHash || !user.totpEnabled || !user.totpSecretEnc) {
      await deps.audit.write({ actorIp: ip, action: "login.failure", metadata: { email: body.email, reason: "no_credentials" } });
      throw Unauthorized();
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      await deps.audit.write({ actorIp: ip, actorUserId: user.id, action: "login.failure", metadata: { reason: "bad_password" } });
      throw Unauthorized();
    }
    // totp_secret_enc is stored as [nonce(12) || ciphertext+tag]
    const blob = Buffer.from(user.totpSecretEnc);
    const nonce = blob.subarray(0, 12);
    const ct = blob.subarray(12);
    const totpSecret = decryptSecret(deps.masterKey, ct, nonce);
    if (!verifyTotp(totpSecret, body.totp)) {
      await deps.audit.write({ actorIp: ip, actorUserId: user.id, action: "login.failure", metadata: { reason: "bad_totp" } });
      throw Unauthorized();
    }
    const { sessionId } = await deps.sessions.create({ userId: user.id, ip, userAgent: req.headers["user-agent"] });
    app.setSessionCookie(reply, sessionId);
    await deps.audit.write({ actorIp: ip, actorUserId: user.id, action: "login.success", metadata: { method: "password+totp" } });
    return { ok: true };
  });

  app.post("/api/auth/logout", { preHandler: app.requireAuth }, async (req, reply) => {
    if (req.session) {
      await deps.sessions.revoke(req.session.sessionId);
      await deps.audit.write({ actorIp: req.ip, actorUserId: req.session.userId, action: "logout" });
    }
    app.clearSessionCookie(reply);
    return reply.status(204).send();
  });

  // TODO: add webauthn start/finish + password setup in follow-up commits in this task.
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- routes/auth.test
git add apps/api/src/http/routes/auth.ts apps/api/src/http/routes/auth.test.ts
git commit -m "api: add password+TOTP login and logout routes

Rate-limited (5/15min/IP), audit-logged, TOTP secret decrypted via master key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Add passkey + setup endpoints**

Following the same TDD loop, append:
- `POST /api/auth/webauthn/registration/start` — receives optional `inviteToken`, stores challenge in a short-lived cookie (`pm_webauthn_challenge`, HttpOnly, 5min), returns options.
- `POST /api/auth/webauthn/registration/finish` — reads challenge cookie, body includes `response`, `email`, `nickname`, optional `inviteToken`. Uses `webauthn.finishRegistration`, persists in `webauthn_credentials`, consumes invite if present, creates session.
- `POST /api/auth/webauthn/login/start` — body `{ email }`, looks up user's credentials, returns options + challenge cookie.
- `POST /api/auth/webauthn/login/finish` — verifies via `webauthn.finishAuthentication`, increments `sign_count`, creates session.
- `POST /api/auth/password/setup` — `preHandler: app.requireAuth`. Body `{ password, totpSecret, totpToken }`. Verifies TOTP token against secret, then stores `password_hash` and `totp_secret_enc` (encrypted), sets `totp_enabled = true`.

Each endpoint is one commit, with test → implement → pass → commit cycles.

After all five are in:

```bash
git log --oneline -5
```

should show five `api: add ...` commits for the five endpoints.

---

## Task 20: Users + invites routes

**Files:** Create `apps/api/src/http/routes/users.ts`, `routes/invites.ts`, tests.

Endpoints (all `preHandler: app.requireAuth`):
- `GET /api/users` — list users.
- `DELETE /api/users/:id` — remove a user (cascade revokes their sessions).
- `POST /api/invites` — body `{ email? }` → returns `{ token, url }` where `url = ${PUBLIC_BASE_URL}/enroll/${token}`. Audit-logged.
- `GET /api/invites` — list outstanding invites.

Follow standard TDD loop. Commit message: `api: add users and invites routes`.

---

## Phase G — Apps, env vars, volumes, domains

## Task 21: Port allocator + apps service

**Files:** Create `apps/api/src/domain/apps.ts` + test.

The port allocator finds an unused integer in `[cfg.internalPortMin, cfg.internalPortMax]` not already in `apps.internal_port`. Race-safe via the `UNIQUE` constraint and retry on conflict.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import { AppsService } from "./apps.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let userId: string;

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "apps@a.com" }).returning();
  userId = u.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("AppsService", () => {
  it("creates apps with unique ports", async () => {
    const svc = new AppsService(db, { portMin: 10000, portMax: 10005 });
    const a = await svc.create({ slug: "a", githubInstallationId: 1n, githubRepoFullName: "o/a", defaultBranch: "main", createdBy: userId });
    const b = await svc.create({ slug: "b", githubInstallationId: 1n, githubRepoFullName: "o/b", defaultBranch: "main", createdBy: userId });
    expect(a.internalPort).not.toBe(b.internalPort);
    expect(a.internalPort).toBeGreaterThanOrEqual(10000);
    expect(a.internalPort).toBeLessThanOrEqual(10005);
  });

  it("rejects duplicate slug", async () => {
    const svc = new AppsService(db, { portMin: 11000, portMax: 11010 });
    await svc.create({ slug: "dup", githubInstallationId: 1n, githubRepoFullName: "o/x", defaultBranch: "main", createdBy: userId });
    await expect(svc.create({ slug: "dup", githubInstallationId: 1n, githubRepoFullName: "o/y", defaultBranch: "main", createdBy: userId }))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement `apps/api/src/domain/apps.ts`**

```ts
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { apps } from "../db/schema.js";
import { Conflict } from "../lib/errors.js";

export type CreateAppInput = {
  slug: string;
  githubInstallationId: bigint;
  githubRepoFullName: string;
  defaultBranch: string;
  buildRoot?: string;
  autoDeploy?: boolean;
  createdBy: string;
};

export class AppsService {
  constructor(private db: Database, private opts: { portMin: number; portMax: number }) {}

  async create(input: CreateAppInput) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const port = await this.allocPort();
      try {
        const [row] = await this.db.insert(apps).values({
          slug: input.slug,
          githubInstallationId: input.githubInstallationId,
          githubRepoFullName: input.githubRepoFullName,
          defaultBranch: input.defaultBranch,
          buildRoot: input.buildRoot ?? ".",
          autoDeploy: input.autoDeploy ?? false,
          internalPort: port,
          createdBy: input.createdBy,
        }).returning();
        return row;
      } catch (e: any) {
        if (e.code === "23505" && /internal_port/.test(e.detail ?? "")) continue; // race; retry
        if (e.code === "23505") throw Conflict(`slug already exists: ${input.slug}`);
        throw e;
      }
    }
    throw new Error("could not allocate port after 10 attempts");
  }

  private async allocPort(): Promise<number> {
    const { rows } = await this.db.execute(sql`
      SELECT g.n AS port
      FROM generate_series(${this.opts.portMin}::int, ${this.opts.portMax}::int) AS g(n)
      WHERE NOT EXISTS (SELECT 1 FROM apps WHERE apps.internal_port = g.n)
      ORDER BY random()
      LIMIT 1
    `);
    const port = (rows[0] as any)?.port as number | undefined;
    if (!port) throw new Error("no free ports in pool");
    return port;
  }

  async listActive() {
    return this.db.select().from(apps).where(isNull(apps.deletedAt));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(apps).where(and(eq(apps.id, id), isNull(apps.deletedAt)));
    return row ?? null;
  }

  async softDelete(id: string) {
    await this.db.update(apps).set({ deletedAt: new Date() }).where(eq(apps.id, id));
  }
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- domain/apps.test
git add apps/api/src/domain/apps.ts apps/api/src/domain/apps.test.ts
git commit -m "api: add AppsService with race-safe port allocator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 22: Env vars service (encrypted CRUD)

**Files:** Create `apps/api/src/domain/env-vars.ts` + test.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import { EnvVarsService } from "./env-vars.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let appId: string;
const masterKey = new Uint8Array(32).map((_, i) => i + 7);

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "env@a.com" }).returning();
  const [a] = await db.insert(schema.apps).values({
    slug: "envapp", githubInstallationId: 1n, githubRepoFullName: "o/e", defaultBranch: "main",
    internalPort: 12345, createdBy: u.id,
  }).returning();
  appId = a.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("EnvVarsService", () => {
  it("upserts and decrypts for runtime", async () => {
    const svc = new EnvVarsService(db, masterKey);
    await svc.upsert(appId, "NODE_ENV", "production", false);
    await svc.upsert(appId, "API_KEY", "s3cr3t", true);
    const list = await svc.listForUi(appId);
    expect(list.find((e) => e.key === "NODE_ENV")?.value).toBe("production");
    expect(list.find((e) => e.key === "API_KEY")?.value).toBe(null); // secret is masked in UI list
    const runtime = await svc.resolveForRuntime(appId);
    expect(runtime.API_KEY).toBe("s3cr3t");
    expect(runtime.NODE_ENV).toBe("production");
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { eq, and } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { appEnvVars } from "../db/schema.js";
import { encryptSecret, decryptSecret } from "../crypto/secrets.js";

export class EnvVarsService {
  constructor(private db: Database, private masterKey: Uint8Array) {}

  async upsert(appId: string, key: string, value: string, isSecret: boolean): Promise<void> {
    const { ciphertext, nonce } = encryptSecret(this.masterKey, value);
    await this.db
      .insert(appEnvVars)
      .values({ appId, key, valueEnc: ciphertext, valueNonce: nonce, isSecret })
      .onConflictDoUpdate({
        target: [appEnvVars.appId, appEnvVars.key],
        set: { valueEnc: ciphertext, valueNonce: nonce, isSecret, updatedAt: new Date() },
      });
  }

  async listForUi(appId: string): Promise<Array<{ key: string; value: string | null; isSecret: boolean }>> {
    const rows = await this.db.select().from(appEnvVars).where(eq(appEnvVars.appId, appId));
    return rows.map((r) => ({
      key: r.key,
      value: r.isSecret ? null : decryptSecret(this.masterKey, r.valueEnc, r.valueNonce),
      isSecret: r.isSecret,
    }));
  }

  async resolveForRuntime(appId: string): Promise<Record<string, string>> {
    const rows = await this.db.select().from(appEnvVars).where(eq(appEnvVars.appId, appId));
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = decryptSecret(this.masterKey, r.valueEnc, r.valueNonce);
    return out;
  }

  async delete(appId: string, key: string): Promise<void> {
    await this.db.delete(appEnvVars).where(and(eq(appEnvVars.appId, appId), eq(appEnvVars.key, key)));
  }
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- domain/env-vars.test
git add apps/api/src/domain/env-vars.ts apps/api/src/domain/env-vars.test.ts
git commit -m "api: add EnvVarsService (encrypted upsert/list/resolve/delete)

Secrets are masked in UI list and only decrypted for runtime delivery.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 23: Volumes service

**Files:** Create `apps/api/src/domain/volumes.ts` + test.

Same pattern. Methods: `add(appId, mountPath)` → creates row with `dockerVolumeName = pm_app_${slug}_${seq}`. `list(appId)`. `remove(appId, mountPath)`.

Commit: `api: add VolumesService`.

---

## Task 24: Domains service (state machine)

**Files:** Create `apps/api/src/domain/domains.ts` + test.

States: `pending_dns → pending_cert → active → renewing → active` (or `failed`).

Methods:
- `add(appId, hostname)` → insert row with `cert_status = "pending_dns"`.
- `checkDns(domainId, expectedIp)` → if `dig +short hostname` returns expectedIp, advance to `pending_cert`.
- `markCertActive(domainId, issuedAt, expiresAt)` and `markCertFailed(domainId, error)` for the worker to call.
- `list(appId)`, `remove(domainId)`.

Use Node's `dns.promises.resolve4` for the DNS check.

Commit: `api: add DomainsService with DNS check + state transitions`.

---

## Task 25: Resource routes (apps, env, volumes, domains)

**Files:** Create `apps/api/src/http/routes/apps.ts`, `env-vars.ts`, `volumes.ts`, `domains.ts` + tests.

Standard REST endpoints, all `preHandler: app.requireAuth`. Each mutation writes an audit log entry (`app.create`, `app.delete`, `env.upsert`, `domain.add`, etc.). Use zod for body validation.

Following the TDD pattern for each route file. Commit each route file separately:
- `api: add apps routes (CRUD + soft-delete)`
- `api: add env vars routes`
- `api: add volumes routes`
- `api: add domains routes`

---

## Phase H — Deployment pipeline

## Task 26: Nginx config templater

**Files:** Create `apps/api/src/lib/nginx-template.ts` + test.

**Function:** `renderManagedSite({ hostname, certActive, upstreamPort, acmeWebroot })` → string. Produces either an HTTP-only conf (for the initial ACME challenge) or a full HTTPS conf with HSTS + HTTP→HTTPS redirect.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { renderManagedSite } from "./nginx-template.js";

describe("renderManagedSite", () => {
  it("renders HTTP-only when cert not yet active", () => {
    const s = renderManagedSite({ hostname: "ex.com", certActive: false, upstreamPort: 10000, acmeWebroot: "/var/www/_acme" });
    expect(s).toContain("listen 80");
    expect(s).not.toContain("listen 443");
    expect(s).toContain("/var/www/_acme");
    expect(s).toContain("server_name ex.com;");
  });

  it("renders HTTPS + HSTS + redirect when cert active", () => {
    const s = renderManagedSite({ hostname: "ex.com", certActive: true, upstreamPort: 10000, acmeWebroot: "/var/www/_acme" });
    expect(s).toContain("listen 443 ssl http2");
    expect(s).toContain("Strict-Transport-Security");
    expect(s).toContain("ssl_certificate /etc/letsencrypt/live/ex.com/fullchain.pem");
    expect(s).toContain("proxy_pass http://127.0.0.1:10000;");
  });
});
```

- [ ] **Step 2: Implement**

```ts
export type RenderInput = {
  hostname: string;
  certActive: boolean;
  upstreamPort: number;
  acmeWebroot: string;
};

export function renderManagedSite(i: RenderInput): string {
  const acmeBlock = `
    location /.well-known/acme-challenge/ {
        root ${i.acmeWebroot};
        try_files $uri =404;
    }`;
  if (!i.certActive) {
    return `# managed by projectMng — do not edit
server {
    listen 80;
    server_name ${i.hostname};
${acmeBlock}
    location / {
        return 503 "certificate pending";
    }
}
`;
  }
  return `# managed by projectMng — do not edit
server {
    listen 80;
    server_name ${i.hostname};
${acmeBlock}
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${i.hostname};

    ssl_certificate /etc/letsencrypt/live/${i.hostname}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${i.hostname}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    client_max_body_size 50m;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:${i.upstreamPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
`;
}
```

- [ ] **Step 3: Test + commit**

```bash
npm test -- nginx-template.test
git add apps/api/src/lib/nginx-template.ts apps/api/src/lib/nginx-template.test.ts
git commit -m "api: add nginx config templater for managed sites

HTTP-only fallback during ACME challenge, full HTTPS + HSTS once cert lands.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 27: BullMQ queue + worker entry point

**Files:** Create `apps/api/src/worker/queue.ts` + tests; modify `apps/api/src/index.worker.ts`.

- [ ] **Step 1: Implement `apps/api/src/worker/queue.ts`**

```ts
import { Queue, Worker, QueueEvents, Job } from "bullmq";
import type Redis from "ioredis";
import { Redis as RedisClass } from "ioredis";

export type DeployJobData = { deploymentId: string };
export type CertIssueJobData = { domainId: string };

export const QUEUES = {
  deploy: "pm:deploy",
  certIssue: "pm:cert-issue",
  certRenew: "pm:cert-renew",
} as const;

export function makeQueues(redisUrl: string) {
  const connection = new RedisClass(redisUrl, { maxRetriesPerRequest: null });
  return {
    deploy: new Queue<DeployJobData>(QUEUES.deploy, { connection }),
    certIssue: new Queue<CertIssueJobData>(QUEUES.certIssue, { connection }),
    certRenew: new Queue(QUEUES.certRenew, { connection }),
    connection,
  };
}

export type WorkerHandlers = {
  deploy: (data: DeployJobData) => Promise<void>;
  certIssue: (data: CertIssueJobData) => Promise<void>;
  certRenew: () => Promise<void>;
};

export function makeWorkers(redisUrl: string, handlers: WorkerHandlers) {
  const connection = new RedisClass(redisUrl, { maxRetriesPerRequest: null });
  const w1 = new Worker<DeployJobData>(QUEUES.deploy, async (job) => handlers.deploy(job.data), { connection, concurrency: 2 });
  const w2 = new Worker<CertIssueJobData>(QUEUES.certIssue, async (job) => handlers.certIssue(job.data), { connection, concurrency: 1 });
  const w3 = new Worker(QUEUES.certRenew, async () => handlers.certRenew(), { connection, concurrency: 1 });
  return { workers: [w1, w2, w3], connection };
}
```

- [ ] **Step 2: Implement `apps/api/src/index.worker.ts`**

```ts
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { loadMasterKey } from "./crypto/master-key.js";
import { HelperClient } from "./clients/helper.js";
import { DockerClient } from "./clients/docker.js";
import { GithubClient } from "./clients/github.js";
import { makeWorkers } from "./worker/queue.js";
import { runDeploy } from "./worker/jobs/deploy.js";
import { runCertIssue } from "./worker/jobs/cert-issue.js";
import { runCertRenew } from "./worker/jobs/cert-renew.js";
import Redis from "ioredis";

async function main() {
  const cfg = loadConfig();
  const { pool, db } = createDb(cfg.databaseUrl);
  const masterKey = loadMasterKey(cfg.masterKeyPath);
  const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
  const helper = new HelperClient(cfg.helperSocketPath);
  const docker = new DockerClient(cfg.dockerProxyUrl);
  const github = new GithubClient({ appId: cfg.githubAppId, privateKeyPath: cfg.githubAppPrivateKeyPath });

  const deps = { cfg, db, redis, masterKey, helper, docker, github };

  const { workers, connection } = makeWorkers(cfg.redisUrl, {
    deploy: (data) => runDeploy(data, deps),
    certIssue: (data) => runCertIssue(data, deps),
    certRenew: () => runCertRenew(deps),
  });

  const shutdown = async () => {
    for (const w of workers) await w.close();
    await connection.quit();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log("pm-worker started");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/worker/queue.ts apps/api/src/index.worker.ts
git commit -m "api: add BullMQ queues/workers and pm-worker entry point

Queues: deploy, cert-issue, cert-renew. Concurrency: 2/1/1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 28: Deploy job (clone → build → swap)

**Files:** Create `apps/api/src/worker/jobs/deploy.ts` + integration test.

**State machine (status field on `deployments`):**

`queued → cloning → building → swapping → succeeded | failed`

**Per step:**

1. **Cloning.** Load deployment + app. Get short-lived install token via `github.installationToken`. `git clone --depth 1 https://x-access-token:<token>@github.com/<repo> <buildDir>` and `git checkout <sha>`. Stream lines into `deployment_logs(stream='clone')` and publish to Redis pub/sub `deploy:<id>:log`.
2. **Building.** If `<buildDir>/<buildRoot>/Dockerfile` exists: `docker build -t pm/<slug>:<sha> <buildRoot>` via the socket proxy. Else: shell out to `nixpacks build <buildRoot> --name pm/<slug>:<sha>`. Stream output.
3. **Swapping.** Ensure docker network `app_<id>` exists (create if not). Resolve runtime env vars via `EnvVarsService.resolveForRuntime`. Allocate a *new* host port (the deployment's `bound_port`) — for v1 use the app's `internal_port` directly (each new revision binds to the same port; we stop the old container first to free the port — true blue/green-with-port-swap is a follow-up; the spec's "zero downtime" is acceptable to violate by a sub-second window for v1, or we can use the app's port for the new container and a temp port for the old). For the v1 simplification: stop the old container, start the new container on `app.internal_port`, poll the health check, then either keep or roll back.
4. **Rewrite upstream config + reload nginx** via `helper.nginxWriteConfig` + `helper.nginxReload`.
5. **Mark deployment succeeded**, store `container_id`.

(Full implementation is ~150 lines; key code shape below.)

- [ ] **Step 1: Implement (no test for the full job — covered by Task 36 E2E; unit-test the helper functions used inside it)**

`apps/api/src/worker/jobs/deploy.ts`:

```ts
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { DockerClient } from "../../clients/docker.js";
import type { HelperClient } from "../../clients/helper.js";
import type { GithubClient } from "../../clients/github.js";
import { apps, deployments, deploymentLogs } from "../../db/schema.js";
import { EnvVarsService } from "../../domain/env-vars.js";
import { renderManagedSite } from "../../lib/nginx-template.js";
import type Redis from "ioredis";

export type DeployDeps = {
  db: Database;
  docker: DockerClient;
  helper: HelperClient;
  github: GithubClient;
  redis: Redis;
  masterKey: Uint8Array;
  cfg: { nginxManagedDir: string; acmeEmail: string };
};

export async function runDeploy(data: { deploymentId: string }, deps: DeployDeps): Promise<void> {
  const [dep] = await deps.db.select().from(deployments).where(eq(deployments.id, data.deploymentId));
  if (!dep) return;
  const [app] = await deps.db.select().from(apps).where(eq(apps.id, dep.appId));
  if (!app) throw new Error("app vanished");

  await setStatus(deps.db, dep.id, "cloning");
  const buildDir = await mkdtemp(join(tmpdir(), `pm-build-${app.slug}-`));
  try {
    const token = await deps.github.installationToken(app.githubInstallationId);
    await stream(deps, dep.id, "clone", `git`, ["clone", "--depth", "1", `https://x-access-token:${token}@github.com/${app.githubRepoFullName}.git`, buildDir]);
    await stream(deps, dep.id, "clone", "git", ["-C", buildDir, "fetch", "--depth", "1", "origin", dep.commitSha]);
    await stream(deps, dep.id, "clone", "git", ["-C", buildDir, "checkout", dep.commitSha]);

    await setStatus(deps.db, dep.id, "building");
    const root = join(buildDir, app.buildRoot);
    const dockerfile = join(root, "Dockerfile");
    const tag = `pm/${app.slug}:${dep.commitSha}`;
    if (await exists(dockerfile)) {
      await stream(deps, dep.id, "build", "docker", ["build", "-t", tag, root]);
    } else {
      await stream(deps, dep.id, "build", "nixpacks", ["build", root, "--name", tag]);
    }

    await setStatus(deps.db, dep.id, "swapping");
    const networkName = `app_${app.id}`;
    try { await deps.docker.createNetwork(networkName); } catch { /* exists */ }
    const envs = new EnvVarsService(deps.db, deps.masterKey);
    const env = await envs.resolveForRuntime(app.id);
    const oldContainers = await deps.docker.listContainersByLabel("pm.app", app.id);
    for (const c of oldContainers) await deps.docker.getContainer(c.Id).stop().catch(() => {});
    const created = await deps.docker.createContainer({
      name: `${app.slug}_${dep.commitSha.slice(0, 12)}`,
      image: tag,
      networkName,
      portBindings: { host: app.internalPort, container: 3000 },
      env,
      memLimitMb: app.memLimitMb,
      cpuLimit: Number(app.cpuLimit),
      restartPolicy: app.restartPolicy,
      labels: { "pm.app": app.id, "pm.deployment": dep.id },
    });
    await created.start();

    // Best-effort health check (skip full impl in v1 → wait fixed 5s).
    await new Promise((r) => setTimeout(r, 5000));

    // Rewrite nginx for all bound domains and reload.
    const { domains } = await import("../../db/schema.js");
    const domainRows = await deps.db.select().from(domains).where(eq(domains.appId, app.id));
    for (const d of domainRows) {
      const conf = renderManagedSite({ hostname: d.hostname, certActive: d.certStatus === "active", upstreamPort: app.internalPort, acmeWebroot: "/var/www/_acme" });
      await deps.helper.nginxWriteConfig(`${app.slug}-${d.hostname.replace(/\./g, "-")}`, conf);
    }
    await deps.helper.nginxReload();

    await deps.db.update(deployments).set({ status: "succeeded", finishedAt: new Date(), containerId: created.id, imageTag: tag, boundPort: app.internalPort }).where(eq(deployments.id, dep.id));
    for (const c of oldContainers) await deps.docker.getContainer(c.Id).remove({ force: true }).catch(() => {});
  } catch (err: any) {
    await deps.db.update(deployments).set({ status: "failed", finishedAt: new Date(), errorSummary: err.message?.slice(0, 1000) }).where(eq(deployments.id, dep.id));
    throw err;
  } finally {
    await rm(buildDir, { recursive: true, force: true });
  }
}

async function setStatus(db: Database, id: string, status: string) {
  await db.update(deployments).set({ status, startedAt: status === "cloning" ? new Date() : undefined }).where(eq(deployments.id, id));
}

async function exists(p: string): Promise<boolean> { try { await stat(p); return true; } catch { return false; } }

function stream(deps: DeployDeps, depId: string, kind: string, bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const onLine = (stream: string) => async (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (!line.length) continue;
        await deps.db.insert(deploymentLogs).values({ deploymentId: depId, stream: kind, line }).catch(() => {});
        await deps.redis.publish(`deploy:${depId}:log`, JSON.stringify({ stream: kind, line }));
      }
    };
    child.stdout.on("data", onLine("stdout"));
    child.stderr.on("data", onLine("stderr"));
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
    child.on("error", reject);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/worker/jobs/deploy.ts
git commit -m "api: add deploy worker job (clone → build → swap → nginx reload)

State machine: queued → cloning → building → swapping → succeeded|failed.
Logs streamed to Postgres + Redis pub/sub.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 29: Cert issue + renew jobs

**Files:** Create `apps/api/src/worker/jobs/cert-issue.ts`, `cert-renew.ts`.

- [ ] **Step 1: Implement cert-issue**

```ts
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { HelperClient } from "../../clients/helper.js";
import { domains } from "../../db/schema.js";
import { renderManagedSite } from "../../lib/nginx-template.js";

export async function runCertIssue(data: { domainId: string }, deps: { db: Database; helper: HelperClient; cfg: { acmeEmail: string } }) {
  const [d] = await deps.db.select().from(domains).where(eq(domains.id, data.domainId));
  if (!d) return;
  try {
    // Write HTTP-only conf, reload, run certbot, then write HTTPS conf, reload again.
    const httpConf = renderManagedSite({ hostname: d.hostname, certActive: false, upstreamPort: 1, acmeWebroot: "/var/www/_acme" });
    await deps.helper.nginxWriteConfig(`acme-${d.hostname.replace(/\./g, "-")}`, httpConf);
    await deps.helper.nginxReload();
    await deps.helper.certbotIssue(d.hostname, deps.cfg.acmeEmail);
    await deps.db.update(domains).set({ certStatus: "active", certIssuedAt: new Date(), certExpiresAt: new Date(Date.now() + 90 * 86_400_000), lastError: null }).where(eq(domains.id, d.id));
  } catch (e: any) {
    await deps.db.update(domains).set({ certStatus: "failed", lastError: e.message?.slice(0, 1000) }).where(eq(domains.id, d.id));
    throw e;
  }
}
```

- [ ] **Step 2: Implement cert-renew**

```ts
import type { HelperClient } from "../../clients/helper.js";
export async function runCertRenew(deps: { helper: HelperClient }) {
  await deps.helper.certbotRenew();
  await deps.helper.nginxReload();
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/worker/jobs/cert-issue.ts apps/api/src/worker/jobs/cert-renew.ts
git commit -m "api: add cert-issue and cert-renew worker jobs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 30: Deployments service + routes

**Files:** Create `apps/api/src/domain/deployments.ts` + `apps/api/src/http/routes/deployments.ts` + tests.

Service methods:
- `enqueueDeploy(appId, commitSha, trigger, triggeredBy?, commitMessage?, commitAuthor?)` — inserts row with `status="queued"`, returns the row, queues a BullMQ job.
- `redeploy(appId)` — finds latest succeeded deployment, enqueues again.
- `rollback(appId, deploymentId)` — re-runs swap against an existing image (separate job not implemented in v1 → simplest impl: enqueue a new "deploy" with the rolled-back commit SHA + re-use existing image tag).
- `list(appId)`, `get(deploymentId)`, `cancel(deploymentId)`.

Routes:
- `POST /api/apps/:id/deployments` — body `{ commitSha? }` (defaults to latest commit on default branch via Github client).
- `GET /api/apps/:id/deployments` — list.
- `GET /api/deployments/:id` — detail incl. logs.
- `POST /api/deployments/:id/redeploy`.
- `POST /api/deployments/:id/rollback` — applies this deployment's `image_tag` as the new running container.

Commit message: `api: add deployments service and routes`.

---

## Phase I — Real-time + GitHub webhook

## Task 31: WebSocket live logs

**Files:** Create `apps/api/src/http/routes/ws-logs.ts` + test.

- [ ] **Step 1: Implement**

```ts
import { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { SessionManager } from "../../auth/sessions.js";

export function registerWsLogs(app: FastifyInstance, deps: { sessions: SessionManager; redis: Redis }) {
  app.get("/api/deployments/:id/logs/ws", { websocket: true }, async (socket, req) => {
    const sid = req.cookies?.pm_session;
    if (!sid || !(await deps.sessions.lookup(sid))) {
      socket.close(4401, "unauthorized");
      return;
    }
    const id = (req.params as any).id as string;
    const sub = deps.redis.duplicate();
    await sub.subscribe(`deploy:${id}:log`);
    sub.on("message", (_ch, msg) => { socket.send(msg); });
    socket.on("close", async () => { await sub.unsubscribe(); await sub.quit(); });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/http/routes/ws-logs.ts
git commit -m "api: add WebSocket route for live deployment logs

Subscribes to deploy:<id>:log Redis channel; auth via session cookie.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 32: Container shell pass-through

**Files:** Create `apps/api/src/http/routes/ws-shell.ts`.

WebSocket endpoint `/api/apps/:id/shell` that opens a `docker exec` against the running container and bridges stdin/stdout over the socket. Uses `dockerode`'s `exec` API with `Tty: true, AttachStdin: true, AttachStdout: true, AttachStderr: true`. Audit-logged with session open/close (no content).

Commit: `api: add WebSocket container shell pass-through (audit-logged)`.

---

## Task 33: GitHub webhook receiver

**Files:** Create `apps/api/src/http/routes/github-webhook.ts` + test.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import { registerGithubWebhook } from "./github-webhook.js";
import { createHmac } from "node:crypto";

describe("GitHub webhook", () => {
  it("rejects bad signature", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    registerGithubWebhook(app, { secret: "topsecret", onPush: async () => {} });
    const r = await app.inject({ method: "POST", url: "/api/github/webhook", headers: { "x-hub-signature-256": "sha256=bad", "x-github-event": "push" }, payload: { hello: "world" } });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it("accepts a valid push and dispatches", async () => {
    let received: any = null;
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    registerGithubWebhook(app, { secret: "topsecret", onPush: async (p) => { received = p; } });
    const body = '{"ref":"refs/heads/main","repository":{"full_name":"o/r"},"after":"abcdef","installation":{"id":99}}';
    const sig = "sha256=" + createHmac("sha256", "topsecret").update(body).digest("hex");
    const r = await app.inject({ method: "POST", url: "/api/github/webhook", headers: { "x-hub-signature-256": sig, "x-github-event": "push", "content-type": "application/json" }, payload: body });
    expect(r.statusCode).toBe(204);
    expect(received?.commitSha).toBe("abcdef");
    expect(received?.installationId).toBe(99);
    await app.close();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { FastifyInstance } from "fastify";
import { verifyGithubSignature } from "../../clients/github.js";
import { Unauthorized } from "../../lib/errors.js";

type PushPayload = { repoFullName: string; commitSha: string; ref: string; installationId: number };

export function registerGithubWebhook(app: FastifyInstance, opts: { secret: string; onPush: (p: PushPayload) => Promise<void> }) {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));

  app.post("/api/github/webhook", async (req, reply) => {
    const sig = String(req.headers["x-hub-signature-256"] ?? "");
    const body = req.body as string;
    if (!verifyGithubSignature(opts.secret, body, sig)) throw Unauthorized("invalid signature");
    const event = String(req.headers["x-github-event"] ?? "");
    if (event === "push") {
      const data = JSON.parse(body);
      await opts.onPush({
        repoFullName: data.repository.full_name,
        commitSha: data.after,
        ref: data.ref,
        installationId: data.installation.id,
      });
    }
    return reply.status(204).send();
  });
}
```

The handler wiring (mapping `repoFullName` + branch to an app, checking `autoDeploy`, calling `deployments.enqueueDeploy`) lives in `index.api.ts` where `onPush` is supplied with the apps/deployments services in scope.

- [ ] **Step 3: Commit**

```bash
npm test -- routes/github-webhook.test
git add apps/api/src/http/routes/github-webhook.ts apps/api/src/http/routes/github-webhook.test.ts
git commit -m "api: add GitHub webhook receiver with signature verification

Push events become auto-deploy triggers when app.auto_deploy is true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 34: Wire all routes into `pm-api`

**Files:** Modify `apps/api/src/index.api.ts`.

Register every route module created in Phases F–I, pass the right deps in. Pseudocode shape (adapt to actual signatures):

```ts
registerAuthRoutes(app, { db, sessions, rateLimit, audit, masterKey, webauthn, invites: new InviteService(db) });
registerEnrollRoutes(app, { invites: new InviteService(db), sessions, audit });
registerUsersRoutes(app, { db, audit });
registerInvitesRoutes(app, { invites: new InviteService(db), audit });
registerAppsRoutes(app, { apps: new AppsService(db, { portMin: cfg.internalPortMin, portMax: cfg.internalPortMax }), github, audit });
registerEnvVarsRoutes(app, { envs: new EnvVarsService(db, masterKey), audit });
registerVolumesRoutes(app, { volumes: new VolumesService(db), audit });
registerDomainsRoutes(app, { domains: new DomainsService(db), queues, audit });
registerDeploymentsRoutes(app, { deployments: new DeploymentsService(db, queues, github), audit });
registerWsLogs(app, { sessions, redis });
registerWsShell(app, { sessions, docker, audit });
registerGithubWebhook(app, {
  secret: cfg.githubWebhookSecret,
  onPush: async (p) => { /* lookup app by repoFullName + ref, enqueue deploy if auto_deploy */ },
});
```

Commit: `api: wire all route modules into pm-api composition root`.

---

## Phase J — End-to-end smoke

## Task 35: Database role hardening migration

**Files:** Create `apps/api/src/db/migrations/00xx_lock_audit_log.sql` (next migration number).

Append the spec's invariant: revoke UPDATE/DELETE on `audit_log` from the app role. Since we run a single Postgres role for v1, we can simulate this by installing a trigger:

```sql
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

Commit: `api: enforce audit_log append-only via trigger`.

---

## Task 36: End-to-end smoke test

**Files:** Create `apps/api/test/e2e.deploy.test.ts`.

**What it does** (executes against a real Docker engine on the host; skipped if Docker is unavailable):

1. Spin up Postgres + Redis containers via Testcontainers.
2. Start a fake "helper" Unix-socket server in-process (just echoes ok responses).
3. Start a real `dockerode` against `unix:///var/run/docker.sock` (bypass the socket proxy in this test).
4. Construct `AppsService`, `EnvVarsService`, `DomainsService`, `DeploymentsService`.
5. Insert a fake `apps` row pointing at a public-ish fixture repo (use `https://github.com/expressjs/express-generator-example` or a tiny one we vend in `test/fixtures/` and serve via `git daemon` if you want full hermeticism).
6. Enqueue a deploy and run the deploy job inline (no worker process — just `runDeploy(data, deps)`).
7. Assert: container is running, listening on the assigned port, and `GET http://127.0.0.1:<port>/` returns 2xx.
8. Clean up: stop+remove container, remove network.

Skipping criteria: `if (process.platform !== "linux" || !process.env.PROJECTMNG_RUN_E2E)`. So this is opt-in on Linux only.

Commit: `api: add end-to-end smoke test (Linux + Docker; opt-in)`.

---

## Done — what you have at the end of Plan 2

- A complete backend (`pm-api` + `pm-worker`) that you can curl to: enroll a user, create an app from a GitHub repo, deploy it, attach a domain, and watch logs over a WebSocket.
- Postgres + Redis schemas locked in; encrypted-at-rest secrets; audit log enforced append-only.
- All four privileged operations go through the Plan 1 helper.
- All container operations go through the Docker socket proxy.
- An end-to-end smoke that deploys a real Express fixture inside a real Docker container on the host (Linux, opt-in).

Plan 3 builds the Next.js dashboard on top of this REST + WS surface. Plan 4 packages the whole thing into the install script the spec promises.

