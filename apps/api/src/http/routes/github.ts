import { FastifyInstance } from "fastify";
import { GithubClient } from "../../clients/github.js";

export type GithubRoutesDeps = { github: GithubClient };

export function registerGithubRoutes(app: FastifyInstance, deps: GithubRoutesDeps) {
  app.get("/api/github/installations", { preHandler: app.requireAuth }, async () => {
    const installations = await deps.github.listInstallations();
    return { installations };
  });

  app.get<{ Params: { id: string } }>(
    "/api/github/installations/:id/repos",
    { preHandler: app.requireAuth },
    async (req) => {
      const id = BigInt(req.params.id);
      const repos = await deps.github.listInstallationRepos(id);
      return { repos };
    },
  );
}
