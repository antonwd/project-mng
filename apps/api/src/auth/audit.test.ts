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
