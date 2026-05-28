import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../../test/setup.js";
import { createServer } from "../server.js";
import { registerEnrollRoutes } from "./enroll.js";
import { InviteService } from "../../domain/invites.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let userId: string;

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "enroll-creator@a.com" }).returning();
  userId = u.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("enroll route", () => {
  it("validates a live invite token", async () => {
    const svc = new InviteService(db);
    const { token } = await svc.createInvite({ createdBy: userId, ttlMs: 60_000, email: "newbie@a.com" });
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    registerEnrollRoutes(app, { db });
    const r = await app.inject({ method: "GET", url: `/api/enroll/${token}` });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).email).toBe("newbie@a.com");
    await app.close();
  });

  it("rejects an unknown token", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    registerEnrollRoutes(app, { db });
    const r = await app.inject({ method: "GET", url: "/api/enroll/nope" });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});
