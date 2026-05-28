import { FastifyInstance } from "fastify";
import { verifyGithubSignature } from "../../clients/github.js";
import { Unauthorized } from "../../lib/errors.js";

export type PushPayload = {
  repoFullName: string;
  commitSha: string;
  ref: string;
  installationId: number;
  commitMessage?: string;
  commitAuthor?: string;
};

export type GithubWebhookOpts = {
  secret: string;
  onPush: (p: PushPayload) => Promise<void>;
};

export function registerGithubWebhook(app: FastifyInstance, opts: GithubWebhookOpts) {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));

  app.post("/api/github/webhook", async (req, reply) => {
    const sig = String(req.headers["x-hub-signature-256"] ?? "");
    const body = req.body as string;
    if (!verifyGithubSignature(opts.secret, body, sig)) throw Unauthorized("invalid signature");
    const event = String(req.headers["x-github-event"] ?? "");
    if (event === "push") {
      const data = JSON.parse(body) as {
        ref: string;
        after: string;
        repository: { full_name: string };
        installation: { id: number };
        head_commit?: { message?: string; author?: { name?: string; email?: string } };
      };
      await opts.onPush({
        repoFullName: data.repository.full_name,
        commitSha: data.after,
        ref: data.ref,
        installationId: data.installation.id,
        commitMessage: data.head_commit?.message,
        commitAuthor: data.head_commit?.author?.name ?? data.head_commit?.author?.email,
      });
    }
    return reply.status(204).send();
  });
}
