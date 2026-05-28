import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { loadMasterKey } from "./crypto/master-key.js";
import { HelperClient } from "./clients/helper.js";
import { DockerClient } from "./clients/docker.js";
import { GithubClient } from "./clients/github.js";
import { makeWorkers } from "./worker/queue.js";
import { runDeploy } from "./worker/jobs/deploy.js";
import { runCertIssue } from "./worker/jobs/cert-issue.js";
import { runCertRenew } from "./worker/jobs/cert-renew.js";
import Redis from "ioredis";

async function main() {
  const cfg = loadConfig();
  const { pool, db } = createDb(cfg.databaseUrl);
  const masterKey = loadMasterKey(cfg.masterKeyPath);
  const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
  const helper = new HelperClient(cfg.helperSocketPath);
  const docker = new DockerClient(cfg.dockerProxyUrl);
  const github = new GithubClient({ appId: cfg.githubAppId, privateKeyPath: cfg.githubAppPrivateKeyPath });

  const deps = { cfg, db, redis, masterKey, helper, docker, github };

  const { workers } = makeWorkers(cfg.redisUrl, {
    deploy: (data) => runDeploy(data, deps),
    certIssue: (data) => runCertIssue(data, deps),
    certRenew: () => runCertRenew(deps),
  });

  const shutdown = async () => {
    for (const w of workers) await w.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log("pm-worker started");
}

main().catch((e) => { console.error(e); process.exit(1); });
