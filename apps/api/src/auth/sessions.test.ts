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
