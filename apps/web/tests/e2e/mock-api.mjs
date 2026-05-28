// Tiny in-process mock of pm-api used by the Playwright smoke.
// Serves only the endpoints the smoke walks through. Holds state in
// memory so create-app → list-apps → enqueue-deploy is observable.
import { createServer } from "node:http";

const port = Number(process.env.MOCK_API_PORT ?? 3001);

const state = {
  users: [{ id: "user-1", email: "smoke@a.com", totpEnabled: true }],
  apps: [],
  deployments: [],
  installations: [{ id: 42, account: "smoke-org" }],
  repos: [{ id: 1, fullName: "smoke-org/hello", defaultBranch: "main" }],
};

const SESSION_COOKIE = "pm_session=mock-session-cookie; Path=/; HttpOnly; SameSite=Strict";

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (c) => { buf += c; });
    req.on("end", () => resolve(buf ? JSON.parse(buf) : {}));
    req.on("error", reject);
  });
}

function isAuthed(req) {
  const cookie = req.headers.cookie ?? "";
  return /pm_session=mock-session-cookie/.test(cookie);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  try {
    if (method === "POST" && path === "/api/auth/password/login") {
      const body = await readBody(req);
      if (body.email === "smoke@a.com" && body.password === "hunter2" && body.totp === "123456") {
        return json(res, 200, { ok: true }, { "set-cookie": SESSION_COOKIE });
      }
      return json(res, 401, { error: { code: "unauthorized", message: "bad creds" } });
    }

    if (method === "POST" && path === "/api/auth/logout") {
      return json(res, 204, "", { "set-cookie": "pm_session=; Path=/; Max-Age=0" });
    }

    if (method === "GET" && path === "/api/me") {
      if (!isAuthed(req)) return json(res, 401, { error: { code: "unauthorized", message: "" } });
      return json(res, 200, state.users[0]);
    }

    if (!isAuthed(req)) return json(res, 401, { error: { code: "unauthorized", message: "" } });

    if (method === "GET" && path === "/api/apps") {
      const include = url.searchParams.get("include");
      if (include === "summary") {
        return json(res, 200, {
          apps: state.apps.map((a) => {
            const lastDeploy = state.deployments.filter((d) => d.appId === a.id).at(-1) ?? null;
            return { ...a, domainCount: 0, lastDeploy };
          }),
        });
      }
      return json(res, 200, { apps: state.apps });
    }

    if (method === "POST" && path === "/api/apps") {
      const body = await readBody(req);
      const app = {
        id: `app-${state.apps.length + 1}`,
        slug: body.slug,
        githubInstallationId: String(body.githubInstallationId),
        githubRepoFullName: body.githubRepoFullName,
        defaultBranch: body.defaultBranch,
        buildRoot: body.buildRoot ?? ".",
        autoDeploy: body.autoDeploy ?? false,
        internalPort: 10000 + state.apps.length,
        memLimitMb: 512,
        cpuLimit: "1.00",
        healthCheckPath: "/",
        healthCheckStatus: 200,
        healthCheckTimeoutS: 60,
        restartPolicy: "unless-stopped",
        createdAt: new Date().toISOString(),
      };
      state.apps.push(app);
      return json(res, 200, { app });
    }

    const appByIdMatch = path.match(/^\/api\/apps\/([^/]+)$/);
    if (method === "GET" && appByIdMatch) {
      const ident = appByIdMatch[1];
      const app = state.apps.find((a) => a.id === ident || a.slug === ident);
      if (!app) return json(res, 404, { error: { code: "not_found", message: "" } });
      return json(res, 200, { app });
    }

    const deploymentsMatch = path.match(/^\/api\/apps\/([^/]+)\/deployments$/);
    if (method === "POST" && deploymentsMatch) {
      const ident = deploymentsMatch[1];
      const app = state.apps.find((a) => a.id === ident || a.slug === ident);
      if (!app) return json(res, 404, { error: { code: "not_found", message: "" } });
      const dep = {
        id: `dep-${state.deployments.length + 1}`,
        appId: app.id,
        commitSha: "abcdef0123456789abcdef0123456789abcdef01",
        commitMessage: "smoke commit",
        commitAuthor: "smoke",
        trigger: "manual",
        triggeredBy: state.users[0].id,
        status: "building",
        imageTag: null,
        containerId: null,
        boundPort: null,
        queuedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        errorSummary: null,
      };
      state.deployments.push(dep);
      return json(res, 200, { deployment: dep });
    }

    if (method === "GET" && deploymentsMatch) {
      const ident = deploymentsMatch[1];
      const app = state.apps.find((a) => a.id === ident || a.slug === ident);
      const deps = state.deployments.filter((d) => d.appId === app?.id);
      return json(res, 200, { deployments: deps });
    }

    const domainsMatch = path.match(/^\/api\/apps\/([^/]+)\/domains$/);
    if (method === "GET" && domainsMatch) return json(res, 200, { domains: [] });

    const volumesMatch = path.match(/^\/api\/apps\/([^/]+)\/volumes$/);
    if (method === "GET" && volumesMatch) return json(res, 200, { volumes: [] });

    const envVarsMatch = path.match(/^\/api\/apps\/([^/]+)\/env-vars$/);
    if (method === "GET" && envVarsMatch) return json(res, 200, { envVars: [] });

    if (method === "GET" && path === "/api/github/installations") {
      return json(res, 200, { installations: state.installations });
    }

    if (method === "GET" && path.startsWith("/api/github/installations/") && path.endsWith("/repos")) {
      return json(res, 200, { repos: state.repos });
    }

    if (method === "GET" && path === "/api/invites") return json(res, 200, { invites: [] });
    if (method === "GET" && path === "/api/users") return json(res, 200, { users: state.users });
    if (method === "GET" && path === "/api/me/credentials") return json(res, 200, { credentials: [] });
    if (method === "GET" && path === "/api/audit-log") return json(res, 200, { events: [] });

    return json(res, 404, { error: { code: "not_found", message: `mock has no route for ${method} ${path}` } });
  } catch (e) {
    return json(res, 500, { error: { code: "mock_error", message: e instanceof Error ? e.message : String(e) } });
  }
});

server.listen(port, () => {
  console.log(`mock pm-api listening on http://localhost:${port}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
