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
  it("upserts and decrypts for runtime, masks secrets in UI listing", async () => {
    const svc = new EnvVarsService(db, masterKey);
    await svc.upsert(appId, "NODE_ENV", "production", false);
    await svc.upsert(appId, "API_KEY", "s3cr3t", true);
    const list = await svc.listForUi(appId);
    expect(list.find((e) => e.key === "NODE_ENV")?.value).toBe("production");
    expect(list.find((e) => e.key === "API_KEY")?.value).toBe(null);
    const runtime = await svc.resolveForRuntime(appId);
    expect(runtime.API_KEY).toBe("s3cr3t");
    expect(runtime.NODE_ENV).toBe("production");
  });

  it("delete removes a single key", async () => {
    const svc = new EnvVarsService(db, masterKey);
    await svc.upsert(appId, "ZAP", "x", false);
    await svc.delete(appId, "ZAP");
    const list = await svc.listForUi(appId);
    expect(list.some((e) => e.key === "ZAP")).toBe(false);
  });
});
