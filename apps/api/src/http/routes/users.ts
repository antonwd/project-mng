import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { AuditLog } from "../../auth/audit.js";
import { Forbidden, NotFound } from "../../lib/errors.js";

export type UsersDeps = { db: Database; audit: AuditLog };

export function registerUsersRoutes(app: FastifyInstance, deps: UsersDeps) {
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
