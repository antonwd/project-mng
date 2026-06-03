import { FastifyInstance, FastifyRequest } from "fastify";
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

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export function registerGithubWebhook(app: FastifyInstance, opts: GithubWebhookOpts) {
  // Replace Fastify's default JSON parser with one that ALSO stashes the raw
  // body string on the request — the webhook handler needs the exact bytes
  // for HMAC-SHA256 signature verification, but every other route still
  // expects req.body to be a parsed object.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req: FastifyRequest, rawBody, done) => {
      const raw = rawBody as string;
      req.rawBody = raw;
      if (!raw) return done(null, undefined);
      try {
        done(null, JSON.parse(raw));
      } catch (e) {
        done(e as Error, undefined);
      }
    },
  );

  app.post("/api/github/webhook", async (req, reply) => {
    const sig = String(req.headers["x-hub-signature-256"] ?? "");
    const rawBody = req.rawBody ?? "";
    if (!verifyGithubSignature(opts.secret, rawBody, sig)) throw Unauthorized("invalid signature");
    const event = String(req.headers["x-github-event"] ?? "");
    if (event === "push") {
      const data = req.body as {
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
