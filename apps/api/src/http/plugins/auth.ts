import fp from "fastify-plugin";
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { SessionManager } from "../../auth/sessions.js";
import { Unauthorized } from "../../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: { userId: string; sessionId: string };
  }
}

const SESSION_COOKIE = "pm_session";

type Options = { sessions: SessionManager };

const plugin: FastifyPluginAsync<Options> = async (app, opts) => {
  app.decorate("requireAuth", async (req: FastifyRequest) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (!sid) throw Unauthorized();
    const s = await opts.sessions.lookup(sid);
    if (!s) throw Unauthorized();
    req.session = { userId: s.userId, sessionId: sid };
    await opts.sessions.touch(sid);
  });
  app.decorate("setSessionCookie", (reply: any, sessionId: string) => {
    reply.setCookie(SESSION_COOKIE, sessionId, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 7 * 24 * 60 * 60 });
  });
  app.decorate("clearSessionCookie", (reply: any) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  });
};

declare module "fastify" {
  interface FastifyInstance {
    requireAuth(req: FastifyRequest): Promise<void>;
    setSessionCookie(reply: any, sessionId: string): void;
    clearSessionCookie(reply: any): void;
  }
}

export default fp(plugin, { name: "pm-auth" });
