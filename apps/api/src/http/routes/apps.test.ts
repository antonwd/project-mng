import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../../test/setup.js";
import { createServer } from "../server.js";
import authPlugin from "../plugins/auth.js";
import { registerAppsRoutes } from "./apps.js";
import { SessionManager } from "../../auth/sessions.js";
import { AuditLog } from "../../auth/audit.js";
import { AppsService } from "../../domain/apps.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("apps routes", () => {
  it("creates, lists, patches, deletes", async () => {
    const [actor] = await db.insert(schema.users).values({ email: `apps-route-${Math.random()}@a.com` }).returning();
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const sessions = new SessionManager(db, { ttlDays: 7 });
    await app.register(authPlugin, { sessions });
    registerAppsRoutes(app, { apps: new AppsService(db, { portMin: 14000, portMax: 14050 }), audit: new AuditLog(db), db });
    const { sessionId } = await sessions.create({ userId: actor.id });
    const cookie = `pm_session=${sessionId}`;

    const created = await app.inject({
      method: "POST",
      url: "/api/apps",
      headers: { cookie },
      payload: { slug: `route-${Date.now()}`, githubInstallationId: 99, githubRepoFullName: "o/r", defaultBranch: "main" },
    });
    expect(created.statusCode).toBe(200);
    const id = JSON.parse(created.body).app.id;

    const list = await app.inject({ method: "GET", url: "/api/apps", headers: { cookie } });
    expect(JSON.parse(list.body).apps.length).toBeGreaterThan(0);

    const patch = await app.inject({
      method: "PATCH",
      url: `/api/apps/${id}`,
      headers: { cookie },
      payload: { autoDeploy: true },
    });
    expect(patch.statusCode).toBe(200);
    expect(JSON.parse(patch.body).app.autoDeploy).toBe(true);

    const del = await app.inject({ method: "DELETE", url: `/api/apps/${id}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    await app.close();
  });
});
