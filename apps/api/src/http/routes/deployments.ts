import { FastifyInstance } from "fastify";
import { z } from "zod";
import { DeploymentsService } from "../../domain/deployments.js";
import { AppsService } from "../../domain/apps.js";
import { GithubClient } from "../../clients/github.js";
import { AuditLog } from "../../auth/audit.js";
import { NotFound, BadRequest } from "../../lib/errors.js";

export type DeploymentsRoutesDeps = {
  deployments: DeploymentsService;
  apps: AppsService;
  github: GithubClient;
  audit: AuditLog;
};

const CreateBody = z.object({ commitSha: z.string().regex(/^[0-9a-f]{7,40}$/).optional() });

export function registerDeploymentsRoutes(app: FastifyInstance, deps: DeploymentsRoutesDeps) {
  app.post<{ Params: { id: string } }>(
    "/api/apps/:id/deployments",
    { preHandler: app.requireAuth },
    async (req) => {
      const body = CreateBody.parse(req.body ?? {});
      const appRow = await deps.apps.get(req.params.id);
      if (!appRow) throw NotFound("app not found");
      let commitSha = body.commitSha;
      if (!commitSha) {
        try {
          const octo = await deps.github.forInstallation(appRow.githubInstallationId);
          const [owner, repo] = appRow.githubRepoFullName.split("/");
          if (!owner || !repo) throw BadRequest("invalid repo name");
          const { data } = await octo.repos.getBranch({ owner, repo, branch: appRow.defaultBranch });
          commitSha = data.commit.sha;
        } catch (e) {
          throw BadRequest(`could not resolve latest commit: ${(e as Error).message}`);
        }
      }
      const dep = await deps.deployments.enqueueDeploy({
        appId: appRow.id,
        commitSha,
        trigger: "manual",
        triggeredBy: req.session!.userId,
      });
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "deploy.enqueue",
        targetType: "app",
        targetId: appRow.id,
        metadata: { commitSha, deploymentId: dep.id },
      });
      return { deployment: dep };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/apps/:id/deployments",
    { preHandler: app.requireAuth },
    async (req) => ({ deployments: await deps.deployments.list(req.params.id) }),
  );

  app.get<{ Params: { id: string } }>(
    "/api/deployments/:id",
    { preHandler: app.requireAuth },
    async (req) => {
      const dep = await deps.deployments.get(req.params.id);
      if (!dep) throw NotFound("deployment not found");
      const logs = await deps.deployments.logs(dep.id);
      return { deployment: dep, logs };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/deployments/:id/redeploy",
    { preHandler: app.requireAuth },
    async (req) => {
      const dep = await deps.deployments.get(req.params.id);
      if (!dep) throw NotFound("deployment not found");
      const result = await deps.deployments.redeploy(dep.appId, req.session!.userId);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "deploy.redeploy",
        targetType: "app",
        targetId: dep.appId,
        metadata: { source: dep.id, deploymentId: result.id },
      });
      return { deployment: result };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/deployments/:id/rollback",
    { preHandler: app.requireAuth },
    async (req) => {
      const dep = await deps.deployments.get(req.params.id);
      if (!dep) throw NotFound("deployment not found");
      const result = await deps.deployments.rollback(dep.appId, dep.id, req.session!.userId);
      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: req.session!.userId,
        action: "deploy.rollback",
        targetType: "app",
        targetId: dep.appId,
        metadata: { source: dep.id, deploymentId: result.id },
      });
      return { deployment: result };
    },
  );
}
