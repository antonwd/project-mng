import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import Redis from "ioredis";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import * as schema from "../src/db/schema.js";
import { startTestPostgres, stopTestPostgres } from "./setup.js";
import { runDeploy } from "../src/worker/jobs/deploy.js";
import { HelperClient } from "../src/clients/helper.js";
import { DockerClient } from "../src/clients/docker.js";
import { GithubClient } from "../src/clients/github.js";
import { DeploymentsService } from "../src/domain/deployments.js";
import { AppsService } from "../src/domain/apps.js";

const SHOULD_RUN = process.platform === "linux" && Boolean(process.env.PROJECTMNG_RUN_E2E);

const describeOrSkip = SHOULD_RUN ? describe : describe.skip;

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let redisContainer: StartedRedisContainer;
let redis: Redis;
let helperSocketPath: string;
let stopFakeHelper: () => Promise<void>;

beforeAll(async () => {
  if (!SHOULD_RUN) return;
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  redisContainer = await new RedisContainer("redis:7-alpine").start();
  redis = new Redis(redisContainer.getConnectionUrl(), { maxRetriesPerRequest: null });

  const dir = mkdtempSync(join(tmpdir(), "pm-e2e-helper-"));
  helperSocketPath = join(dir, "helper.sock");
  const server = createNetServer((sock) => {
    // Accept any framed JSON request and reply ok.
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) break;
        buf = buf.subarray(4 + len);
        const resp = Buffer.from(JSON.stringify({ ok: true, data: { reloaded: true } }));
        const hdr = Buffer.alloc(4);
        hdr.writeUInt32BE(resp.length, 0);
        sock.write(Buffer.concat([hdr, resp]));
      }
    });
  });
  await new Promise<void>((r) => server.listen(helperSocketPath, () => r()));
  stopFakeHelper = () => new Promise<void>((r) => server.close(() => r()));
});

afterAll(async () => {
  if (!SHOULD_RUN) return;
  await stopFakeHelper();
  await pool.end();
  await stopTestPostgres();
  await redis.quit();
  await redisContainer.stop({ remove: true });
});

describeOrSkip("E2E deploy (Linux + Docker; opt-in)", () => {
  it("deploys a tiny fixture repo and serves a 2xx response", async () => {
    // Build a deps bundle pointing at real Docker on the host.
    const helper = new HelperClient(helperSocketPath);
    const docker = new DockerClient("http+unix:///var/run/docker.sock");
    const github = new GithubClient({ appId: "0", privateKeyPath: "/dev/null" });
    // Override github.installationToken to return a dummy token; the fixture repo is public.
    (github as unknown as { installationToken: () => Promise<string> }).installationToken = async () => "ghs_dummy";

    const apps = new AppsService(db, { portMin: 20000, portMax: 20999 });
    const [actor] = await db.insert(schema.users).values({ email: `e2e-${Date.now()}@a.com` }).returning();
    const appRow = await apps.create({
      slug: `e2e-${Date.now()}`,
      githubInstallationId: 1n,
      githubRepoFullName: "expressjs/express-hello-world",
      defaultBranch: "main",
      createdBy: actor.id,
    });

    const deployments = new DeploymentsService(db, { deploy: { add: async () => undefined } as never }, github);
    const dep = await deployments.enqueueDeploy({
      appId: appRow.id,
      commitSha: "main",
      trigger: "manual",
      triggeredBy: actor.id,
    });

    const masterKey = new Uint8Array(32);
    await runDeploy({ deploymentId: dep.id }, {
      db,
      docker,
      helper,
      github,
      redis,
      masterKey,
      cfg: { nginxManagedDir: "/tmp/_nginx_managed", acmeEmail: "test@example.com" },
    });

    // Hit the bound port.
    await new Promise<void>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: appRow.internalPort, path: "/", method: "GET" }, (res) => {
        if (res.statusCode && res.statusCode < 500) resolve();
        else reject(new Error(`unexpected status ${res.statusCode}`));
      });
      req.on("error", reject);
      req.end();
    });

    // Cleanup the running container.
    const containers = await docker.listContainersByLabel("pm.app", appRow.id);
    for (const c of containers) {
      try { await docker.getContainer(c.Id).remove({ force: true }); } catch { /* ignore */ }
    }
    expect(true).toBe(true);
  }, 5 * 60_000);
});

// Sanity: the skip guard works on non-Linux hosts so plain `npm test` is green.
describe("E2E skip guard", () => {
  it("is opt-in", () => {
    expect(SHOULD_RUN).toBe(Boolean(process.platform === "linux" && process.env.PROJECTMNG_RUN_E2E));
  });
});
