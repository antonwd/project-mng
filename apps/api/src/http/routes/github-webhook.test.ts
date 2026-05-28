import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import { registerGithubWebhook } from "./github-webhook.js";
import { createHmac } from "node:crypto";

describe("GitHub webhook", () => {
  it("rejects bad signature", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    registerGithubWebhook(app, { secret: "topsecret", onPush: async () => {} });
    const r = await app.inject({
      method: "POST",
      url: "/api/github/webhook",
      headers: { "x-hub-signature-256": "sha256=bad", "x-github-event": "push", "content-type": "application/json" },
      payload: JSON.stringify({ hello: "world" }),
    });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it("accepts a valid push and dispatches", async () => {
    let received: any = null;
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    registerGithubWebhook(app, { secret: "topsecret", onPush: async (p) => { received = p; } });
    const body = '{"ref":"refs/heads/main","repository":{"full_name":"o/r"},"after":"abcdef","installation":{"id":99}}';
    const sig = "sha256=" + createHmac("sha256", "topsecret").update(body).digest("hex");
    const r = await app.inject({
      method: "POST",
      url: "/api/github/webhook",
      headers: { "x-hub-signature-256": sig, "x-github-event": "push", "content-type": "application/json" },
      payload: body,
    });
    expect(r.statusCode).toBe(204);
    expect(received?.commitSha).toBe("abcdef");
    expect(received?.installationId).toBe(99);
    await app.close();
  });

  it("ignores non-push events even if signature is valid", async () => {
    let called = 0;
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    registerGithubWebhook(app, { secret: "topsecret", onPush: async () => { called++; } });
    const body = "{}";
    const sig = "sha256=" + createHmac("sha256", "topsecret").update(body).digest("hex");
    const r = await app.inject({
      method: "POST",
      url: "/api/github/webhook",
      headers: { "x-hub-signature-256": sig, "x-github-event": "ping", "content-type": "application/json" },
      payload: body,
    });
    expect(r.statusCode).toBe(204);
    expect(called).toBe(0);
    await app.close();
  });
});
