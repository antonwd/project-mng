import { eq, desc, and } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { Database } from "../db/client.js";
import { deployments, deploymentLogs } from "../db/schema.js";
import type { GithubClient } from "../clients/github.js";
import { NotFound, BadRequest } from "../lib/errors.js";

export type DeploymentQueues = {
  deploy: Queue<{ deploymentId: string }>;
};

export class DeploymentsService {
  constructor(
    private db: Database,
    private queues: DeploymentQueues,
    private github: GithubClient,
  ) {}

  async enqueueDeploy(args: {
    appId: string;
    commitSha: string;
    trigger: "manual" | "webhook" | "redeploy" | "rollback";
    triggeredBy?: string;
    commitMessage?: string;
    commitAuthor?: string;
    imageTag?: string;
  }) {
    const inserted = await this.db.insert(deployments).values({
      appId: args.appId,
      commitSha: args.commitSha,
      commitMessage: args.commitMessage ?? null,
      commitAuthor: args.commitAuthor ?? null,
      trigger: args.trigger,
      triggeredBy: args.triggeredBy ?? null,
      status: "queued",
      imageTag: args.imageTag ?? null,
    }).returning();
    const row = inserted[0];
    if (!row) throw new Error("failed to enqueue deployment");
    await this.queues.deploy.add("deploy", { deploymentId: row.id }, { removeOnComplete: 1000, removeOnFail: 1000 });
    return row;
  }

  async redeploy(appId: string, triggeredBy?: string) {
    const [last] = await this.db.select().from(deployments).where(
      and(eq(deployments.appId, appId), eq(deployments.status, "succeeded")),
    ).orderBy(desc(deployments.finishedAt)).limit(1);
    if (!last) throw NotFound("no successful deployment to redeploy");
    return this.enqueueDeploy({
      appId,
      commitSha: last.commitSha,
      trigger: "redeploy",
      triggeredBy,
      imageTag: last.imageTag ?? undefined,
    });
  }

  async rollback(appId: string, deploymentId: string, triggeredBy?: string) {
    const [target] = await this.db.select().from(deployments).where(
      and(eq(deployments.id, deploymentId), eq(deployments.appId, appId)),
    );
    if (!target) throw NotFound("deployment not found");
    if (target.status !== "succeeded" || !target.imageTag) throw BadRequest("can only rollback to a successful deployment with a built image");
    return this.enqueueDeploy({
      appId,
      commitSha: target.commitSha,
      trigger: "rollback",
      triggeredBy,
      imageTag: target.imageTag,
    });
  }

  async list(appId: string) {
    return this.db.select().from(deployments).where(eq(deployments.appId, appId)).orderBy(desc(deployments.queuedAt));
  }

  async get(deploymentId: string) {
    const [row] = await this.db.select().from(deployments).where(eq(deployments.id, deploymentId));
    return row ?? null;
  }

  async logs(deploymentId: string) {
    return this.db.select().from(deploymentLogs).where(eq(deploymentLogs.deploymentId, deploymentId)).orderBy(deploymentLogs.ts);
  }

  async cancel(deploymentId: string) {
    const [row] = await this.db.select().from(deployments).where(eq(deployments.id, deploymentId));
    if (!row) throw NotFound("deployment not found");
    if (row.status !== "queued") throw BadRequest("only queued deployments can be cancelled");
    await this.db.update(deployments).set({ status: "failed", finishedAt: new Date(), errorSummary: "cancelled" }).where(eq(deployments.id, deploymentId));
  }
}
