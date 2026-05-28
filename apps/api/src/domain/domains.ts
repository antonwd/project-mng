import { eq } from "drizzle-orm";
import { promises as dns } from "node:dns";
import type { Database } from "../db/client.js";
import { domains } from "../db/schema.js";
import { BadRequest, Conflict, NotFound } from "../lib/errors.js";

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/;

export type DnsResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: DnsResolver = (h) => dns.resolve4(h);

export class DomainsService {
  constructor(private db: Database, private resolver: DnsResolver = defaultResolver) {}

  async add(appId: string, hostname: string) {
    if (!HOSTNAME_RE.test(hostname)) throw BadRequest("invalid hostname");
    try {
      const inserted = await this.db.insert(domains).values({ appId, hostname }).returning();
      const row = inserted[0];
      if (!row) throw new Error("insert returned no row");
      return row;
    } catch (e: any) {
      if (e.code === "23505") throw Conflict(`hostname already in use: ${hostname}`);
      throw e;
    }
  }

  async checkDns(domainId: string, expectedIp: string): Promise<{ status: string; resolved: string[] }> {
    const [row] = await this.db.select().from(domains).where(eq(domains.id, domainId));
    if (!row) throw NotFound("domain not found");
    if (row.certStatus !== "pending_dns") return { status: row.certStatus, resolved: [] };
    let resolved: string[] = [];
    try {
      resolved = await this.resolver(row.hostname);
    } catch {
      return { status: "pending_dns", resolved: [] };
    }
    if (resolved.includes(expectedIp)) {
      await this.db.update(domains)
        .set({ certStatus: "pending_cert", updatedAt: new Date() })
        .where(eq(domains.id, domainId));
      return { status: "pending_cert", resolved };
    }
    return { status: "pending_dns", resolved };
  }

  async markCertActive(domainId: string, issuedAt: Date, expiresAt: Date) {
    await this.db.update(domains)
      .set({ certStatus: "active", certIssuedAt: issuedAt, certExpiresAt: expiresAt, lastError: null, updatedAt: new Date() })
      .where(eq(domains.id, domainId));
  }

  async markCertFailed(domainId: string, error: string) {
    await this.db.update(domains)
      .set({ certStatus: "failed", lastError: error.slice(0, 1000), updatedAt: new Date() })
      .where(eq(domains.id, domainId));
  }

  async list(appId: string) {
    return this.db.select().from(domains).where(eq(domains.appId, appId));
  }

  async get(id: string) {
    const [row] = await this.db.select().from(domains).where(eq(domains.id, id));
    return row ?? null;
  }

  async remove(domainId: string) {
    await this.db.delete(domains).where(eq(domains.id, domainId));
  }
}
