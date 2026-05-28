import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import Redis from "ioredis";
import * as schema from "../../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../../test/setup.js";
import { createServer } from "../server.js";
import authPlugin from "../plugins/auth.js";
import { registerAuthRoutes } from "./auth.js";
import { SessionManager } from "../../auth/sessions.js";
import { RateLimiter } from "../../auth/rate-limit.js";
import { AuditLog } from "../../auth/audit.js";
import { hashPassword } from "../../auth/password.js";
import { authenticator } from "otplib";
import { encryptSecret } from "../../crypto/secrets.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let redisContainer: StartedRedisContainer;
let redis: Redis;
const masterKey = new Uint8Array(32).map((_, i) => i + 1);

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  redisContainer = await new RedisContainer("redis:7-alpine").start();
  redis = new Redis(redisContainer.getConnectionUrl(), { maxRetriesPerRequest: null });
});
afterAll(async () => {
  await pool.end();
  await stopTestPostgres();
  await redis.quit();
  await redisContainer.stop({ remove: true });
});

describe("auth routes", () => {
  it("password+TOTP login then logout", async () => {
    const totpSecret = authenticator.generateSecret();
    const totpEnc = encryptSecret(masterKey, totpSecret);
    const blob = new Uint8Array(totpEnc.nonce.length + totpEnc.ciphertext.length);
    blob.set(totpEnc.nonce, 0);
    blob.set(totpEnc.ciphertext, totpEnc.nonce.length);
    const [user] = await db.insert(schema.users).values({
      email: "login@a.com",
      passwordHash: await hashPassword("hunter2"),
      totpSecretEnc: blob,
      totpEnabled: true,
    }).returning();

    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const sessions = new SessionManager(db, { ttlDays: 7 });
    await app.register(authPlugin, { sessions });
    registerAuthRoutes(app, { db, sessions, rateLimit: new RateLimiter(redis), audit: new AuditLog(db), masterKey, webauthn: null as any, invites: null as any });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/password/login",
      payload: { email: "login@a.com", password: "hunter2", totp: authenticator.generate(totpSecret) },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(String(cookie)).toContain("pm_session=");

    const sessionCookie = String(cookie).split(";")[0]!;
    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: sessionCookie } });
    expect(logout.statusCode).toBe(204);

    await app.close();
    expect(user.id).toBeTypeOf("string");
  });

  it("rejects bad password", async () => {
    const totpSecret = authenticator.generateSecret();
    const totpEnc = encryptSecret(masterKey, totpSecret);
    const blob = new Uint8Array(totpEnc.nonce.length + totpEnc.ciphertext.length);
    blob.set(totpEnc.nonce, 0);
    blob.set(totpEnc.ciphertext, totpEnc.nonce.length);
    const [user] = await db.insert(schema.users).values({
      email: "wrong@a.com",
      passwordHash: await hashPassword("right"),
      totpSecretEnc: blob,
      totpEnabled: true,
    }).returning();

    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const sessions = new SessionManager(db, { ttlDays: 7 });
    await app.register(authPlugin, { sessions });
    registerAuthRoutes(app, { db, sessions, rateLimit: new RateLimiter(redis), audit: new AuditLog(db), masterKey, webauthn: null as any, invites: null as any });

    const r = await app.inject({
      method: "POST",
      url: "/api/auth/password/login",
      payload: { email: "wrong@a.com", password: "wrong", totp: authenticator.generate(totpSecret) },
    });
    expect(r.statusCode).toBe(401);
    await app.close();
    expect(user.id).toBeTypeOf("string");
  });
});
