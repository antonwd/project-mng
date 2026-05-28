import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppsService } from "../../domain/apps.js";
import { AuditLog } from "../../auth/audit.js";
import { NotFound } from "../../lib/errors.js";

export type AppsRoutesDeps = { apps: AppsService; audit: AuditLog };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const CreateBody = z.object({
  slug: z.string().regex(SLUG_RE),
  githubInstallationId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  githubRepoFullName: z.string().regex(REPO_RE),
  defaultBranch: z.string().min(1).default("main"),
  buildRoot: z.string().optional(),
  autoDeploy: z.boolean().optional(),
});

const UpdateBody = z.object({
  defaultBranch: z.string().min(1).optional(),
  buildRoot: z.string().optional(),
  autoDeploy: z.boolean().optional(),
});

export function registerAppsRoutes(app: FastifyInstance, deps: AppsRoutesDeps) {
  app.get("/api/apps", { preHandler: app.requireAuth }, async () => {
    const rows = await deps.apps.listActive();
    return { apps: rows };
  });

  app.post("/api/apps", { preHandler: app.requireAuth }, async (req) => {
    const body = CreateBody.parse(req.body);
    const created = await deps.apps.create({
      slug: body.slug,
      githubInstallationId: BigInt(body.githubInstallationId),
      githubRepoFullName: body.githubRepoFullName,
      defaultBranch: body.defaultBranch,
      buildRoot: body.buildRoot,
      autoDeploy: body.autoDeploy,
      createdBy: req.session!.userId,
    });
    await deps.audit.write({
      actorIp: req.ip,
      actorUserId: req.session!.userId,
      action: "app.create",
      targetType: "app",
      targetId: created.id,
      metadata: { slug: created.slug, repo: created.githubRepoFullName },
    });
    return { app: created };
  });

  app.get<{ Params: { id: string } }>("/api/apps/:id", { preHandler: app.requireAuth }, async (req) => {
    const row = await deps.apps.get(req.params.id);
    if (!row) throw NotFound("app not found");
    return { app: row };
  });

  app.patch<{ Params: { id: string } }>("/api/apps/:id", { preHandler: app.requireAuth }, async (req) => {
    const row = await deps.apps.get(req.params.id);
    if (!row) throw NotFound("app not found");
    const body = UpdateBody.parse(req.body);
    const updated = await deps.apps.update(row.id, body);
    if (!updated) throw NotFound("app not found");
    await deps.audit.write({
      actorIp: req.ip,
      actorUserId: req.session!.userId,
      action: "app.update",
      targetType: "app",
      targetId: row.id,
      metadata: body as Record<string, unknown>,
    });
    return { app: updated };
  });

  app.delete<{ Params: { id: string } }>("/api/apps/:id", { preHandler: app.requireAuth }, async (req, reply) => {
    const row = await deps.apps.get(req.params.id);
    if (!row) throw NotFound("app not found");
    await deps.apps.softDelete(req.params.id);
    await deps.audit.write({
      actorIp: req.ip,
      actorUserId: req.session!.userId,
      action: "app.delete",
      targetType: "app",
      targetId: row.id,
      metadata: { slug: row.slug },
    });
    return reply.status(204).send();
  });
}
