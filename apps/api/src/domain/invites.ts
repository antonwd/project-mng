import { eq, and, isNull, gt } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { invites, users } from "../db/schema.js";
import { generateOpaqueToken, hashToken } from "../crypto/tokens.js";
import { NotFound, Conflict } from "../lib/errors.js";

export class InviteService {
  constructor(private db: Database) {}

  async createInvite(args: { createdBy: string; email?: string; ttlMs: number }): Promise<{ token: string }> {
    const token = generateOpaqueToken(32);
    const hash = hashToken(token);
    await this.db.insert(invites).values({
      tokenHash: hash,
      createdBy: args.createdBy,
      email: args.email ?? null,
      expiresAt: new Date(Date.now() + args.ttlMs),
    });
    return { token };
  }

  async consume(token: string, newUserEmail: string): Promise<{ userId: string }> {
    const hash = hashToken(token);
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(invites).where(
        and(eq(invites.tokenHash, hash), isNull(invites.consumedAt), gt(invites.expiresAt, new Date())),
      );
      const invite = rows[0];
      if (!invite) throw NotFound("invite invalid or expired");
      const existing = await tx.select().from(users).where(eq(users.email, newUserEmail));
      if (existing.length > 0) throw Conflict("email already registered");
      const insertedUsers = await tx.insert(users).values({ email: newUserEmail }).returning();
      const user = insertedUsers[0];
      if (!user) throw new Error("failed to insert user");
      await tx.update(invites).set({ consumedAt: new Date(), consumedBy: user.id }).where(eq(invites.tokenHash, hash));
      return { userId: user.id };
    });
  }

  async list(): Promise<Array<{ createdBy: string; email: string | null; expiresAt: Date; consumedAt: Date | null }>> {
    const rows = await this.db.select().from(invites);
    return rows.map((r) => ({ createdBy: r.createdBy, email: r.email, expiresAt: r.expiresAt, consumedAt: r.consumedAt }));
  }
}
