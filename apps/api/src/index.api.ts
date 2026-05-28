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
import { createServer } from "./http/server.js";
import authPlugin from "./http/plugins/auth.js";
import Redis from "ioredis";

async function main() {
  const cfg = loadConfig();
  const { pool, db } = createDb(cfg.databaseUrl);
  loadMasterKey(cfg.masterKeyPath); // fail fast if missing
  const redis = new Redis(cfg.redisUrl, { maxRetriesPerRequest: null });
  const helper = new HelperClient(cfg.helperSocketPath);
  const docker = new DockerClient(cfg.dockerProxyUrl);
  const github = new GithubClient({ appId: cfg.githubAppId, privateKeyPath: cfg.githubAppPrivateKeyPath });
  const webauthn = new WebAuthnService({ rpId: cfg.webauthnRpId, rpName: cfg.webauthnRpName, origin: cfg.publicBaseUrl });
  const sessions = new SessionManager(db, { ttlDays: 7 });
  const audit = new AuditLog(db);
  const rateLimit = new RateLimiter(redis);

  const app = await createServer({ cookieSecret: cfg.cookieSecret });
  await app.register(authPlugin, { sessions });
  app.decorate("svc", { cfg, db, redis, helper, docker, github, webauthn, sessions, audit, rateLimit });

  // Route registration happens in Phase F+ tasks.

  await app.listen({ host: "0.0.0.0", port: cfg.httpPort });
  app.log.info({ port: cfg.httpPort }, "pm-api listening");

  const shutdown = async () => {
    await app.close();
    await pool.end();
    await redis.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });
