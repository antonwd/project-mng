import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users, webauthnCredentials } from "../../db/schema.js";
import { AuditLog } from "../../auth/audit.js";
import { Forbidden, NotFound, Unauthorized } from "../../lib/errors.js";

export type UsersDeps = { db: Database; audit: AuditLog };

export function registerUsersRoutes(app: FastifyInstance, deps: UsersDeps) {
  app.get("/api/me", { preHandler: app.requireAuth }, async (req) => {
    const [row] = await deps.db
      .select({ id: users.id, email: users.email, totpEnabled: users.totpEnabled })
      .from(users)
      .where(eq(users.id, req.session!.userId));
    if (!row) throw Unauthorized();
    return row;
  });

  app.get("/api/me/credentials", { preHandler: app.requireAuth }, async (req) => {
    const rows = await deps.db
      .select({
        id: webauthnCredentials.id,
        nickname: webauthnCredentials.nickname,
        createdAt: webauthnCredentials.createdAt,
        lastUsedAt: webauthnCredentials.lastUsedAt,
      })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, req.session!.userId));
    return { credentials: rows };
  });

  app.delete<{ Params: { id: string } }>(
    "/api/me/credentials/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const [existing] = await deps.db
        .select()
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.id, req.params.id));
      if (!existing || existing.userId !== req.session!.userId) throw NotFound("credential not found");
      await deps.db.delete(webauthnCredentials).where(eq(webauthnCredentials.id, req.params.id));
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "credential.remove",
        targetType: "credential",
        targetId: req.params.id,
        metadata: { nickname: existing.nickname },
      });
      return reply.status(204).send();
    },
  );

  app.get("/api/users", { preHandler: app.requireAuth }, async () => {
    const rows = await deps.db.select({
      id: users.id,
      email: users.email,
      totpEnabled: users.totpEnabled,
      createdAt: users.createdAt,
    }).from(users);
    return { users: rows };
  });

  app.delete<{ Params: { id: string } }>("/api/users/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const id = req.params.id;
    if (id === req.session!.userId) throw Forbidden("cannot delete your own account");
    const [existing] = await deps.db.select().from(users).where(eq(users.id, id));
    if (!existing) throw NotFound("user not found");
    await deps.db.delete(users).where(eq(users.id, id));
    await deps.audit.write({
      actorIp: req.ip,
      actorUserId: req.session!.userId,
      action: "user.delete",
      targetType: "user",
      targetId: id,
    });
    return reply.status(204).send();
  });
}
