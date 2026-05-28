import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { AppsService } from "../../domain/apps.js";
import { AuditLog } from "../../auth/audit.js";
import { NotFound } from "../../lib/errors.js";
import { deployments, domains } from "../../db/schema.js";

export type AppsRoutesDeps = { apps: AppsService; audit: AuditLog; db: Database };

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
  app.get<{ Querystring: { include?: string } }>(
    "/api/apps",
    { preHandler: app.requireAuth },
    async (req) => {
      const rows = await deps.apps.listActive();
      if (req.query.include !== "summary" || rows.length === 0) {
        return { apps: rows };
      }
      const ids = rows.map((r) => r.id);
      const domainCounts = await deps.db
        .select({ appId: domains.appId, n: count() })
        .from(domains)
        .where(inArray(domains.appId, ids))
        .groupBy(domains.appId);
      const domainCountById = new Map(domainCounts.map((d) => [d.appId, Number(d.n)]));
      // Latest deployment per app via a window-over-the-table query.
      const lastDeploysResult = await deps.db.execute(sql`
        SELECT DISTINCT ON (app_id)
          app_id, id, status, queued_at, started_at, finished_at, commit_sha
        FROM deployments
        WHERE app_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        ORDER BY app_id, queued_at DESC
      `);
      const lastDeploysRows = (lastDeploysResult as unknown as { rows: Array<{ app_id: string; id: string; status: string; queued_at: Date; started_at: Date | null; finished_at: Date | null; commit_sha: string }> }).rows;
      const lastByApp = new Map(
        lastDeploysRows.map((d) => [d.app_id, {
          id: d.id,
          status: d.status,
          queuedAt: d.queued_at,
          startedAt: d.started_at,
          finishedAt: d.finished_at,
          commitSha: d.commit_sha,
        }]),
      );
      return {
        apps: rows.map((r) => ({
          ...r,
          domainCount: domainCountById.get(r.id) ?? 0,
          lastDeploy: lastByApp.get(r.id) ?? null,
        })),
      };
    },
  );

  // Suppress unused-var on optional helpers.
  void desc; void and; void eq; void deployments;

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
