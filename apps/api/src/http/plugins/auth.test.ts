import { describe, it, expect } from "vitest";
import { createServer } from "../server.js";
import authPlugin from "./auth.js";

describe("auth plugin", () => {
  it("rejects requests without a session cookie", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const fakeSessions = { lookup: async () => null, touch: async () => {}, create: async () => ({ sessionId: "s" }), revoke: async () => {} } as any;
    await app.register(authPlugin, { sessions: fakeSessions });
    app.get("/me", { preHandler: app.requireAuth }, async (req) => ({ userId: req.session!.userId }));
    const r = await app.inject({ method: "GET", url: "/me" });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it("allows requests with a valid cookie", async () => {
    const app = await createServer({ cookieSecret: "x".repeat(32) });
    const fakeSessions = { lookup: async (id: string) => (id === "good" ? { userId: "u1" } : null), touch: async () => {} } as any;
    await app.register(authPlugin, { sessions: fakeSessions });
    app.get("/me", { preHandler: app.requireAuth }, async (req) => ({ userId: req.session!.userId }));
    const r = await app.inject({ method: "GET", url: "/me", cookies: { pm_session: "good" } });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).userId).toBe("u1");
    await app.close();
  });
});
