import { FastifyInstance } from "fastify";
import { z } from "zod";
import { InviteService } from "../../domain/invites.js";
import { AuditLog } from "../../auth/audit.js";

export type InvitesDeps = {
  invites: InviteService;
  audit: AuditLog;
  publicBaseUrl: string;
};

const CreateInviteBody = z.object({ email: z.string().email().optional() });

export function registerInvitesRoutes(app: FastifyInstance, deps: InvitesDeps) {
  app.post("/api/invites", { preHandler: app.requireAuth }, async (req) => {
    const body = CreateInviteBody.parse(req.body ?? {});
    const { token } = await deps.invites.createInvite({
      createdBy: req.session!.userId,
      email: body.email,
      ttlMs: 24 * 60 * 60 * 1000,
    });
    const url = `${deps.publicBaseUrl}/enroll/${token}`;
    await deps.audit.write({
      actorIp: req.ip,
      actorUserId: req.session!.userId,
      action: "invite.create",
      targetType: "invite",
      metadata: { email: body.email ?? null },
    });
    return { token, url };
  });

  app.get("/api/invites", { preHandler: app.requireAuth }, async () => {
    const list = await deps.invites.list();
    return { invites: list };
  });
}
