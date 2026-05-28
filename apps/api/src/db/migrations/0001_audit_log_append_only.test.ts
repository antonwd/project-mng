import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../schema.js";
import { startTestPostgres, stopTestPostgres } from "../../../test/setup.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("audit_log append-only trigger", () => {
  it("blocks UPDATE and DELETE on audit_log rows", async () => {
    const [u] = await db.insert(schema.users).values({ email: `audit-immut-${Math.random()}@a.com` }).returning();
    await db.insert(schema.auditLog).values({ actorUserId: u.id, action: "test.append-only" });
    const [row] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.actorUserId, u.id));
    await expect(
      db.update(schema.auditLog).set({ action: "tamper" }).where(eq(schema.auditLog.id, row.id)),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.delete(schema.auditLog).where(eq(schema.auditLog.id, row.id)),
    ).rejects.toThrow(/append-only/);
  });
});
