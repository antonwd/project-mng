import { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainsService } from "../../domain/domains.js";
import { AuditLog } from "../../auth/audit.js";
import type { Queue } from "bullmq";
import { NotFound } from "../../lib/errors.js";

export type DomainsRoutesDeps = {
  domains: DomainsService;
  audit: AuditLog;
  certIssueQueue?: Queue<{ domainId: string }> | null;
  expectedHostIp?: string;
};

const AddBody = z.object({ hostname: z.string().min(1) });
const CheckBody = z.object({ expectedIp: z.string().min(1).optional() });

export function registerDomainsRoutes(app: FastifyInstance, deps: DomainsRoutesDeps) {
  app.get<{ Params: { id: string } }>(
    "/api/apps/:id/domains",
    { preHandler: app.requireAuth },
    async (req) => ({ domains: await deps.domains.list(req.params.id) }),
  );

  app.post<{ Params: { id: string } }>(
    "/api/apps/:id/domains",
    { preHandler: app.requireAuth },
    async (req) => {
      const body = AddBody.parse(req.body);
      const d = await deps.domains.add(req.params.id, body.hostname);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "domain.add",
        targetType: "app",
        targetId: req.params.id,
        metadata: { hostname: body.hostname },
      });
      return { domain: d };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/domains/:id/check-dns",
    { preHandler: app.requireAuth },
    async (req) => {
      const body = CheckBody.parse(req.body ?? {});
      const expected = body.expectedIp ?? deps.expectedHostIp;
      if (!expected) throw NotFound("expected ip not configured");
      const result = await deps.domains.checkDns(req.params.id, expected);
      if (result.status === "pending_cert" && deps.certIssueQueue) {
        await deps.certIssueQueue.add("issue", { domainId: req.params.id });
      }
      return result;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/domains/:id",
    { preHandler: app.requireAuth },
    async (req, reply) => {
      const d = await deps.domains.get(req.params.id);
      if (!d) throw NotFound("domain not found");
      await deps.domains.remove(req.params.id);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "domain.remove",
        targetType: "domain",
        targetId: req.params.id,
        metadata: { hostname: d.hostname },
      });
      return reply.status(204).send();
    },
  );
}
