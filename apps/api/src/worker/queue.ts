import { Queue, Worker, ConnectionOptions } from "bullmq";

export type DeployJobData = { deploymentId: string };
export type CertIssueJobData = { domainId: string };

// BullMQ rejects queue names containing ":" (it uses ":" as the Redis key
// namespace separator internally). Use dashes — the names are otherwise free-form.
export const QUEUES = {
  deploy: "pm-deploy",
  certIssue: "pm-cert-issue",
  certRenew: "pm-cert-renew",
} as const;

function parseRedisUrl(url: string): { host: string; port: number; password?: string; username?: string } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
  };
}

function connectionFor(redisUrl: string): ConnectionOptions {
  return { ...parseRedisUrl(redisUrl), maxRetriesPerRequest: null };
}

export function makeQueues(redisUrl: string) {
  const connection = connectionFor(redisUrl);
  return {
    deploy: new Queue<DeployJobData>(QUEUES.deploy, { connection }),
    certIssue: new Queue<CertIssueJobData>(QUEUES.certIssue, { connection }),
    certRenew: new Queue(QUEUES.certRenew, { connection }),
  };
}

export type WorkerHandlers = {
  deploy: (data: DeployJobData) => Promise<void>;
  certIssue: (data: CertIssueJobData) => Promise<void>;
  certRenew: () => Promise<void>;
};

export function makeWorkers(redisUrl: string, handlers: WorkerHandlers) {
  const connection = connectionFor(redisUrl);
  const w1 = new Worker<DeployJobData>(QUEUES.deploy, async (job) => handlers.deploy(job.data), { connection, concurrency: 2 });
  const w2 = new Worker<CertIssueJobData>(QUEUES.certIssue, async (job) => handlers.certIssue(job.data), { connection, concurrency: 1 });
  const w3 = new Worker(QUEUES.certRenew, async () => handlers.certRenew(), { connection, concurrency: 1 });
  return { workers: [w1, w2, w3] };
}
