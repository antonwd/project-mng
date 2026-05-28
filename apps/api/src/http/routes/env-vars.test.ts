import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../../test/setup.js";
import { createServer } from "../server.js";
import authPlugin from "../plugins/auth.js";
import { registerEnvVarsRoutes } from "./env-vars.js";
import { SessionManager } from "../../auth/sessions.js";
import { AuditLog } from "../../auth/audit.js";
import { EnvVarsService } from "../../domain/env-vars.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
const masterKey = new Uint8Array(32).map((_, i) => i + 11);

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("env-vars routes", () => {
  it("upsert + list + delete", async () => {
    const [actor] = await db.insert(schema.users).values({ email: `env-r-${Math.random()}@a.com` }).returning();
    const [appRow] = await db.insert(schema.apps).values({
      slug: `envr-${Date.now()}`, githubInstallationId: 1n, githubRepoFullName: "o/envr",
      defaultBranch: "main", internalPort: 19000 + Math.floor(Math.random() * 100), createdBy: actor.id,
    }).returning();
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const sessions = new SessionManager(db, { ttlDays: 7 });
    await app.register(authPlugin, { sessions });
    registerEnvVarsRoutes(app, { envs: new EnvVarsService(db, masterKey), audit: new AuditLog(db) });
    const { sessionId } = await sessions.create({ userId: actor.id });
    const cookie = `pm_session=${sessionId}`;

    const post = await app.inject({
      method: "POST",
      url: `/api/apps/${appRow.id}/env-vars`,
      headers: { cookie },
      payload: { key: "DB_URL", value: "postgres://x", isSecret: true },
    });
    expect(post.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: `/api/apps/${appRow.id}/env-vars`, headers: { cookie } });
    const envs = JSON.parse(list.body).envVars;
    expect(envs[0].key).toBe("DB_URL");
    expect(envs[0].value).toBe(null); // masked

    const del = await app.inject({ method: "DELETE", url: `/api/apps/${appRow.id}/env-vars/DB_URL`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    await app.close();
  });

  it("rejects bad key", async () => {
    const [actor] = await db.insert(schema.users).values({ email: `env-bad-${Math.random()}@a.com` }).returning();
    const [appRow] = await db.insert(schema.apps).values({
      slug: `envb-${Date.now()}`, githubInstallationId: 1n, githubRepoFullName: "o/envb",
      defaultBranch: "main", internalPort: 19500 + Math.floor(Math.random() * 100), createdBy: actor.id,
    }).returning();
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const sessions = new SessionManager(db, { ttlDays: 7 });
    await app.register(authPlugin, { sessions });
    registerEnvVarsRoutes(app, { envs: new EnvVarsService(db, masterKey), audit: new AuditLog(db) });
    const { sessionId } = await sessions.create({ userId: actor.id });
    const r = await app.inject({
      method: "POST",
      url: `/api/apps/${appRow.id}/env-vars`,
      headers: { cookie: `pm_session=${sessionId}` },
      payload: { key: "lower_case", value: "x" },
    });
    expect(r.statusCode).toBe(500);
    await app.close();
  });
});
