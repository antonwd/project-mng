import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../db/schema.js";
import { startTestPostgres, stopTestPostgres } from "../../test/setup.js";
import { DomainsService } from "./domains.js";

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;
let appId: string;

beforeAll(async () => {
  pool = new Pool({ connectionString: await startTestPostgres() });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "dom@a.com" }).returning();
  const [a] = await db.insert(schema.apps).values({
    slug: "domapp", githubInstallationId: 1n, githubRepoFullName: "o/d", defaultBranch: "main",
    internalPort: 13355, createdBy: u.id,
  }).returning();
  appId = a.id;
});
afterAll(async () => { await pool.end(); await stopTestPostgres(); });

describe("DomainsService", () => {
  it("adds, validates hostname, rejects duplicates", async () => {
    const svc = new DomainsService(db);
    const d = await svc.add(appId, "ex.example.com");
    expect(d.certStatus).toBe("pending_dns");
    await expect(svc.add(appId, "not_valid")).rejects.toThrow();
    await expect(svc.add(appId, "ex.example.com")).rejects.toThrow(/already in use/);
  });

  it("checkDns advances to pending_cert on match", async () => {
    const fakeResolver = async (_: string) => ["203.0.113.7"];
    const svc = new DomainsService(db, fakeResolver);
    const d = await svc.add(appId, "match.example.com");
    const ok = await svc.checkDns(d.id, "203.0.113.7");
    expect(ok.status).toBe("pending_cert");
    const noop = await svc.checkDns(d.id, "203.0.113.7");
    expect(noop.status).toBe("pending_cert");
  });

  it("checkDns stays pending_dns on mismatch / resolver error", async () => {
    const svc1 = new DomainsService(db, async () => ["1.1.1.1"]);
    const d = await svc1.add(appId, "mismatch.example.com");
    const r1 = await svc1.checkDns(d.id, "2.2.2.2");
    expect(r1.status).toBe("pending_dns");

    const svc2 = new DomainsService(db, async () => { throw new Error("dns down"); });
    const r2 = await svc2.checkDns(d.id, "1.1.1.1");
    expect(r2.status).toBe("pending_dns");
  });

  it("markCertActive / markCertFailed flip status", async () => {
    const svc = new DomainsService(db);
    const d = await svc.add(appId, "cert.example.com");
    const issuedAt = new Date();
    const expiresAt = new Date(Date.now() + 90 * 86_400_000);
    await svc.markCertActive(d.id, issuedAt, expiresAt);
    expect((await svc.get(d.id))?.certStatus).toBe("active");
    await svc.markCertFailed(d.id, "boom");
    expect((await svc.get(d.id))?.certStatus).toBe("failed");
    expect((await svc.get(d.id))?.lastError).toBe("boom");
  });
});
