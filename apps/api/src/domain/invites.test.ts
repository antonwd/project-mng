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
