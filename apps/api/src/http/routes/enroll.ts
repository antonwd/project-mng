import { FastifyInstance } from "fastify";
import { and, eq, isNull, gt } from "drizzle-orm";
import { invites } from "../../db/schema.js";
import type { Database } from "../../db/client.js";
import { hashToken } from "../../crypto/tokens.js";
import { NotFound } from "../../lib/errors.js";

export type EnrollDeps = { db: Database };

export function registerEnrollRoutes(app: FastifyInstance, deps: EnrollDeps) {
  app.get<{ Params: { token: string } }>("/api/enroll/:token", async (req) => {
    const hash = hashToken(req.params.token);
    const [invite] = await deps.db.select().from(invites).where(
      and(eq(invites.tokenHash, hash), isNull(invites.consumedAt), gt(invites.expiresAt, new Date())),
    );
    if (!invite) throw NotFound("invite invalid or expired");
    return {
      valid: true,
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
    };
  });
}
