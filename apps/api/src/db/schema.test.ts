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

    // teardown
    await db.delete(schema.apps).where(sql`id = ${app.id}`);
    await db.delete(schema.users).where(sql`id = ${user.id}`);
  });
});
