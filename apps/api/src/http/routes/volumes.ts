import { FastifyInstance } from "fastify";
import { z } from "zod";
import { VolumesService } from "../../domain/volumes.js";
import { AuditLog } from "../../auth/audit.js";

export type VolumesRoutesDeps = { volumes: VolumesService; audit: AuditLog };

const AddBody = z.object({ mountPath: z.string().min(1) });

export function registerVolumesRoutes(app: FastifyInstance, deps: VolumesRoutesDeps) {
  app.get<{ Params: { id: string } }>(
    "/api/apps/:id/volumes",
    { preHandler: app.requireAuth },
    async (req) => ({ volumes: await deps.volumes.list(req.params.id) }),
  );

  app.post<{ Params: { id: string } }>(
    "/api/apps/:id/volumes",
    { preHandler: app.requireAuth },
    async (req) => {
      const body = AddBody.parse(req.body);
      const v = await deps.volumes.add(req.params.id, body.mountPath);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "volume.add",
        targetType: "app",
        targetId: req.params.id,
        metadata: { mountPath: body.mountPath, dockerVolumeName: v.dockerVolumeName },
      });
      return { volume: v };
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { mountPath: string } }>(
    "/api/apps/:id/volumes",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const mountPath = req.query.mountPath;
      if (!mountPath) return reply.status(400).send({ error: { code: "bad_request", message: "mountPath required" } });
      await deps.volumes.remove(req.params.id, mountPath);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "volume.remove",
        targetType: "app",
        targetId: req.params.id,
        metadata: { mountPath },
      });
      return reply.status(204).send();
    },
  );
}
