import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import { VolumesService } from "./volumes.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let appId: string;

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "vol@a.com" }).returning();
  const [a] = await db.insert(schema.apps).values({
    slug: "volapp", githubInstallationId: 1n, githubRepoFullName: "o/v", defaultBranch: "main",
    internalPort: 13345, createdBy: u.id,
  }).returning();
  appId = a.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("VolumesService", () => {
  it("adds, lists, and removes with deterministic docker names", async () => {
    const svc = new VolumesService(db);
    const v1 = await svc.add(appId, "/data");
    const v2 = await svc.add(appId, "/cache");
    expect(v1.dockerVolumeName).toBe("pm_app_volapp_1");
    expect(v2.dockerVolumeName).toBe("pm_app_volapp_2");
    const list = await svc.list(appId);
    expect(list.length).toBe(2);
    await svc.remove(appId, "/data");
    const after = await svc.list(appId);
    expect(after.length).toBe(1);
    expect(after[0]?.mountPath).toBe("/cache");
  });

  it("rejects bad mount paths and duplicate mount", async () => {
    const svc = new VolumesService(db);
    await expect(svc.add(appId, "no-leading-slash")).rejects.toThrow();
    await svc.add(appId, "/unique");
    await expect(svc.add(appId, "/unique")).rejects.toThrow();
  });
});
