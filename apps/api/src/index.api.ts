import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { loadMasterKey } from "./crypto/master-key.js";
import { HelperClient } from "./clients/helper.js";
import { DockerClient } from "./clients/docker.js";
import { GithubClient } from "./clients/github.js";
import { WebAuthnService } from "./auth/webauthn.js";
import { SessionManager } from "./auth/sessions.js";
import { AuditLog } from "./auth/audit.js";
import { RateLimiter } from "./auth/rate-limit.js";
import { InviteService } from "./domain/invites.js";
import { AppsService } from "./domain/apps.js";
import { EnvVarsService } from "./domain/env-vars.js";
import { VolumesService } from "./domain/volumes.js";
import { DomainsService } from "./domain/domains.js";
import { DeploymentsService } from "./domain/deployments.js";
import { makeQueues } from "./worker/queue.js";
import { createServer } from "./http/server.js";
import authPlugin from "./http/plugins/auth.js";
import { registerAuthRoutes } from "./http/routes/auth.js";
import { registerEnrollRoutes } from "./http/routes/enroll.js";
import { registerUsersRoutes } from "./http/routes/users.js";
import { registerInvitesRoutes } from "./http/routes/invites.js";
import { registerAppsRoutes } from "./http/routes/apps.js";
import { registerEnvVarsRoutes } from "./http/routes/env-vars.js";
import { registerVolumesRoutes } from "./http/routes/volumes.js";
import { registerDomainsRoutes } from "./http/routes/domains.js";
import { registerDeploymentsRoutes } from "./http/routes/deployments.js";
import { registerWsLogs } from "./http/routes/ws-logs.js";
import { registerWsShell } from "./http/routes/ws-shell.js";
import { registerGithubWebhook } from "./http/routes/github-webhook.js";
import { registerGithubRoutes } from "./http/routes/github.js";
import Redis from "ioredis";

async function main() {
  const cfg = loadConfig();
  const { pool, db } = createDb(cfg.databaseUrl);
  const masterKey = loadMasterKey(cfg.masterKeyPath);
  const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });

  const helper = new HelperClient(cfg.helperSocketPath);
  const docker = new DockerClient(cfg.dockerProxyUrl);
  const github = new GithubClient({ appId: cfg.githubAppId, privateKeyPath: cfg.githubAppPrivateKeyPath });
  const webauthn = new WebAuthnService({ rpId: cfg.webauthnRpId, rpName: cfg.webauthnRpName, origin: cfg.publicBaseUrl });

  const sessions = new SessionManager(db, { ttlDays: 7 });
  const audit = new AuditLog(db);
  const rateLimit = new RateLimiter(redis);

  const invites = new InviteService(db);
  const appsSvc = new AppsService(db, { portMin: cfg.internalPortMin, portMax: cfg.internalPortMax });
  const envs = new EnvVarsService(db, masterKey);
  const volumes = new VolumesService(db);
  const domainsSvc = new DomainsService(db);
  const queues = makeQueues(cfg.redisUrl);
  const deploymentsSvc = new DeploymentsService(db, { deploy: queues.deploy }, github);

  const app = await createServer({ cookieSecret: cfg.cookieSecret });
  await app.register(authPlugin, { sessions });

  registerAuthRoutes(app, { db, sessions, rateLimit, audit, masterKey, webauthn, invites });
  registerEnrollRoutes(app, { db });
  registerUsersRoutes(app, { db, audit });
  registerInvitesRoutes(app, { invites, audit, publicBaseUrl: cfg.publicBaseUrl });
  registerAppsRoutes(app, { apps: appsSvc, audit, db });
  registerGithubRoutes(app, { github });
  registerEnvVarsRoutes(app, { envs, audit });
  registerVolumesRoutes(app, { volumes, audit });
  registerDomainsRoutes(app, { domains: domainsSvc, audit, certIssueQueue: queues.certIssue });
  registerDeploymentsRoutes(app, { deployments: deploymentsSvc, apps: appsSvc, github, audit });
  registerWsLogs(app, { sessions, redis });
  registerWsShell(app, { sessions, docker, db, audit });
  registerGithubWebhook(app, {
    secret: cfg.githubWebhookSecret,
    onPush: async (p) => {
      const appRow = await appsSvc.getByRepo(p.repoFullName);
      if (!appRow || !appRow.autoDeploy) return;
      const expectedRef = `refs/heads/${appRow.defaultBranch}`;
      if (p.ref !== expectedRef) return;
      await deploymentsSvc.enqueueDeploy({
        appId: appRow.id,
        commitSha: p.commitSha,
        trigger: "webhook",
        commitMessage: p.commitMessage,
        commitAuthor: p.commitAuthor,
      });
    },
  });

  await app.listen({ host: "0.0.0.0", port: cfg.httpPort });
  app.log.info({ port: cfg.httpPort }, "pm-api listening");

  const shutdown = async () => {
    await app.close();
    await queues.deploy.close();
    await queues.certIssue.close();
    await queues.certRenew.close();
    await pool.end();
    await redis.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
