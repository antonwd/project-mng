import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../../test/setup.js";
import { createServer } from "../server.js";
import authPlugin from "../plugins/auth.js";
import { registerUsersRoutes } from "./users.js";
import { registerInvitesRoutes } from "./invites.js";
import { SessionManager } from "../../auth/sessions.js";
import { AuditLog } from "../../auth/audit.js";
import { InviteService } from "../../domain/invites.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

async function setupApp() {
  const [actor] = await db.insert(schema.users).values({ email: `actor-${Math.random()}@a.com` }).returning();
  const app = await createServer({ cookieSecret: "x".repeat(32) });
  const sessions = new SessionManager(db, { ttlDays: 7 });
  await app.register(authPlugin, { sessions });
  registerUsersRoutes(app, { db, audit: new AuditLog(db) });
  registerInvitesRoutes(app, { invites: new InviteService(db), audit: new AuditLog(db), publicBaseUrl: "https://pm.example.com" });
  const { sessionId } = await sessions.create({ userId: actor.id });
  return { app, actor, sessionId };
}

describe("users + invites routes", () => {
  it("lists users when authed, rejects when not", async () => {
    const { app, sessionId } = await setupApp();
    const unauthed = await app.inject({ method: "GET", url: "/api/users" });
    expect(unauthed.statusCode).toBe(401);
    const authed = await app.inject({ method: "GET", url: "/api/users", headers: { cookie: `pm_session=${sessionId}` } });
    expect(authed.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(authed.body).users)).toBe(true);
    await app.close();
  });

  it("delete user 404s on missing, 403s on self", async () => {
    const { app, actor, sessionId } = await setupApp();
    const self = await app.inject({
      method: "DELETE",
      url: `/api/users/${actor.id}`,
      headers: { cookie: `pm_session=${sessionId}` },
    });
    expect(self.statusCode).toBe(403);

    const missing = await app.inject({
      method: "DELETE",
      url: "/api/users/00000000-0000-0000-0000-000000000000",
      headers: { cookie: `pm_session=${sessionId}` },
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it("creates an invite and lists it", async () => {
    const { app, sessionId } = await setupApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/invites",
      headers: { cookie: `pm_session=${sessionId}` },
      payload: { email: "guest@a.com" },
    });
    expect(created.statusCode).toBe(200);
    const body = JSON.parse(created.body);
    expect(body.token).toBeTypeOf("string");
    expect(body.url).toContain("/enroll/");

    const list = await app.inject({
      method: "GET",
      url: "/api/invites",
      headers: { cookie: `pm_session=${sessionId}` },
    });
    expect(list.statusCode).toBe(200);
    const invites = JSON.parse(list.body).invites;
    expect(invites.some((i: any) => i.email === "guest@a.com")).toBe(true);
    await app.close();
  });
});

// Silence unused-import lint for `eq` if not used in this file.
void eq;
