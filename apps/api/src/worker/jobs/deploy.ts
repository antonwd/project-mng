import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import type { DockerClient } from "../../clients/docker.js";
import type { HelperClient } from "../../clients/helper.js";
import type { GithubClient } from "../../clients/github.js";
import { apps, deployments, deploymentLogs, domains } from "../../db/schema.js";
import { EnvVarsService } from "../../domain/env-vars.js";
import { renderManagedSite } from "../../lib/nginx-template.js";
import type Redis from "ioredis";

export type DeployDeps = {
  db: Database;
  docker: DockerClient;
  helper: HelperClient;
  github: GithubClient;
  redis: Redis;
  masterKey: Uint8Array;
  cfg: { nginxManagedDir: string; acmeEmail: string };
};

export async function runDeploy(data: { deploymentId: string }, deps: DeployDeps): Promise<void> {
  const [dep] = await deps.db.select().from(deployments).where(eq(deployments.id, data.deploymentId));
  if (!dep) return;
  const [app] = await deps.db.select().from(apps).where(eq(apps.id, dep.appId));
  if (!app) throw new Error("app vanished");

  await setStatus(deps.db, dep.id, "cloning");
  const buildDir = await mkdtemp(join(tmpdir(), `pm-build-${app.slug}-`));
  try {
    const token = await deps.github.installationToken(app.githubInstallationId);
    await stream(deps, dep.id, "clone", "git", ["clone", "--depth", "1", `https://x-access-token:${token}@github.com/${app.githubRepoFullName}.git`, buildDir]);
    await stream(deps, dep.id, "clone", "git", ["-C", buildDir, "fetch", "--depth", "1", "origin", dep.commitSha]);
    await stream(deps, dep.id, "clone", "git", ["-C", buildDir, "checkout", dep.commitSha]);

    await setStatus(deps.db, dep.id, "building");
    const root = join(buildDir, app.buildRoot);
    const dockerfile = join(root, "Dockerfile");
    const tag = `pm/${app.slug}:${dep.commitSha}`;
    if (await exists(dockerfile)) {
      await stream(deps, dep.id, "build", "docker", ["build", "-t", tag, root]);
    } else {
      await stream(deps, dep.id, "build", "nixpacks", ["build", root, "--name", tag]);
    }

    await setStatus(deps.db, dep.id, "swapping");
    const networkName = `app_${app.id}`;
    try { await deps.docker.createNetwork(networkName); } catch { /* exists */ }
    const envs = new EnvVarsService(deps.db, deps.masterKey);
    // The container's published port is hardcoded to 3000 (see portBindings
    // below), so default PORT=3000 unless the user explicitly overrode it.
    const env: Record<string, string> = { PORT: "3000", ...(await envs.resolveForRuntime(app.id)) };
    const oldContainers = await deps.docker.listContainersByLabel("pm.app", app.id);
    for (const c of oldContainers) {
      try { await deps.docker.getContainer(c.Id).stop(); } catch { /* ignore */ }
    }
    const created = await deps.docker.createContainer({
      name: `${app.slug}_${dep.commitSha.slice(0, 12)}`,
      image: tag,
      networkName,
      portBindings: { host: app.internalPort, container: 3000 },
      env,
      memLimitMb: app.memLimitMb,
      cpuLimit: Number(app.cpuLimit),
      restartPolicy: app.restartPolicy,
      labels: { "pm.app": app.id, "pm.deployment": dep.id },
    });
    await created.start();

    // v1 health check: fixed 5s settle.
    await new Promise((r) => setTimeout(r, 5000));

    const domainRows = await deps.db.select().from(domains).where(eq(domains.appId, app.id));
    for (const d of domainRows) {
      const conf = renderManagedSite({
        hostname: d.hostname,
        certActive: d.certStatus === "active",
        upstreamPort: app.internalPort,
        acmeWebroot: "/var/www/_acme",
      });
      await deps.helper.nginxWriteConfig(`${app.slug}-${d.hostname.replace(/\./g, "-")}`, conf);
    }
    if (domainRows.length > 0) await deps.helper.nginxReload();

    await deps.db.update(deployments).set({
      status: "succeeded",
      finishedAt: new Date(),
      containerId: created.id,
      imageTag: tag,
      boundPort: app.internalPort,
    }).where(eq(deployments.id, dep.id));

    for (const c of oldContainers) {
      try { await deps.docker.getContainer(c.Id).remove({ force: true }); } catch { /* ignore */ }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await deps.db.update(deployments).set({
      status: "failed",
      finishedAt: new Date(),
      errorSummary: msg.slice(0, 1000),
    }).where(eq(deployments.id, dep.id));
    throw err;
  } finally {
    await rm(buildDir, { recursive: true, force: true });
  }
}

async function setStatus(db: Database, id: string, status: string) {
  const patch: Record<string, unknown> = { status };
  if (status === "cloning") patch.startedAt = new Date();
  await db.update(deployments).set(patch).where(eq(deployments.id, id));
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

function stream(deps: DeployDeps, depId: string, kind: string, bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const onLine = () => async (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (!line.length) continue;
        try {
          await deps.db.insert(deploymentLogs).values({ deploymentId: depId, stream: kind, line });
        } catch { /* don't crash the deploy on a log write failure */ }
        try {
          await deps.redis.publish(`deploy:${depId}:log`, JSON.stringify({ stream: kind, line }));
        } catch { /* ignore */ }
      }
    };
    child.stdout.on("data", onLine());
    child.stderr.on("data", onLine());
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
    child.on("error", reject);
  });
}
