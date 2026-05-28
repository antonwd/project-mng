import { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { InviteService } from "../../domain/invites.js";
import { Forbidden, Conflict } from "../../lib/errors.js";

export type BootstrapDeps = {
  db: Database;
  invites: InviteService;
};

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function registerBootstrapRoutes(app: FastifyInstance, deps: BootstrapDeps) {
  app.post("/api/admin/bootstrap", async (req) => {
    if (!LOOPBACK_IPS.has(req.ip)) throw Forbidden("bootstrap requires loopback");
    const result = await deps.db.execute(sql`SELECT COUNT(*)::int AS n FROM users`);
    const rows = (result as unknown as { rows: Array<{ n: number }> }).rows;
    const n = rows[0]?.n ?? 0;
    if (n > 0) throw Conflict("bootstrap already complete (users exist)");

    // invites.created_by is NOT NULL with an FK → users(id). For the one-shot bootstrap
    // we insert a sentinel user that satisfies the FK; the operator's real account is
    // created when they consume the invite.
    const inserted = await deps.db
      .insert(users)
      .values({ email: "__bootstrap__@projectmng.local" })
      .returning();
    const sentinel = inserted[0];
    if (!sentinel) throw new Error("failed to insert bootstrap sentinel");
    const { token } = await deps.invites.createInvite({
      createdBy: sentinel.id,
      email: undefined,
      ttlMs: 30 * 60 * 1000,
    });
    return { token };
  });
}
