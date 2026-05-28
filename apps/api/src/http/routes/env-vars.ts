import { FastifyInstance } from "fastify";
import { z } from "zod";
import { EnvVarsService } from "../../domain/env-vars.js";
import { AuditLog } from "../../auth/audit.js";

export type EnvVarsRoutesDeps = { envs: EnvVarsService; audit: AuditLog };

const KEY_RE = /^[A-Z_][A-Z0-9_]*$/;
const UpsertBody = z.object({
  key: z.string().regex(KEY_RE).max(128),
  value: z.string(),
  isSecret: z.boolean().default(true),
});

export function registerEnvVarsRoutes(app: FastifyInstance, deps: EnvVarsRoutesDeps) {
  app.get<{ Params: { id: string } }>(
    "/api/apps/:id/env-vars",
    { preHandler: app.requireAuth },
    async (req) => ({ envVars: await deps.envs.listForUi(req.params.id) }),
  );

  app.post<{ Params: { id: string } }>(
    "/api/apps/:id/env-vars",
    { preHandler: app.requireAuth },
    async (req) => {
      const body = UpsertBody.parse(req.body);
      await deps.envs.upsert(req.params.id, body.key, body.value, body.isSecret);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "env.upsert",
        targetType: "app",
        targetId: req.params.id,
        metadata: { key: body.key, isSecret: body.isSecret },
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string; key: string } }>(
    "/api/apps/:id/env-vars/:key",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      await deps.envs.delete(req.params.id, req.params.key);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "env.delete",
        targetType: "app",
        targetId: req.params.id,
        metadata: { key: req.params.key },
      });
      return reply.status(204).send();
    },
  );
}
