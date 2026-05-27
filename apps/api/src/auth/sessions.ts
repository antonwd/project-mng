import { eq, and, isNull, gt } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { sessions } from "../db/schema.js";

export class SessionManager {
  constructor(private db: Database, private opts: { ttlDays: number }) {}

  async create(args: { userId: string; ip?: string; userAgent?: string }) {
    const expiresAt = new Date(Date.now() + this.opts.ttlDays * 86_400_000);
    const rows = await this.db.insert(sessions).values({
      userId: args.userId,
      ipInet: args.ip ?? null,
      userAgent: args.userAgent ?? null,
      expiresAt,
    }).returning();
    const row = rows[0];
    if (!row) throw new Error("failed to create session");
    return { sessionId: row.id };
  }

  async lookup(sessionId: string): Promise<{ userId: string } | null> {
    const rows = await this.db.select().from(sessions).where(
      and(eq(sessions.id, sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    );
    const row = rows[0];
    return row ? { userId: row.userId } : null;
  }

  async touch(sessionId: string) {
    const newExpiry = new Date(Date.now() + this.opts.ttlDays * 86_400_000);
    await this.db.update(sessions).set({ lastSeenAt: new Date(), expiresAt: newExpiry }).where(eq(sessions.id, sessionId));
  }

  async revoke(sessionId: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }
}
