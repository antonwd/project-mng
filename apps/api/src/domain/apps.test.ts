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

  it("lookup helpers return rows", async () => {
    const svc = new AppsService(db, { portMin: 12000, portMax: 12010 });
    const c = await svc.create({ slug: "lookup", githubInstallationId: 2n, githubRepoFullName: "o/lookup", defaultBranch: "main", createdBy: userId });
    expect((await svc.getBySlug("lookup"))?.id).toBe(c.id);
    expect((await svc.getByRepo("o/lookup"))?.id).toBe(c.id);
    await svc.softDelete(c.id);
    expect(await svc.getBySlug("lookup")).toBe(null);
  });
});
