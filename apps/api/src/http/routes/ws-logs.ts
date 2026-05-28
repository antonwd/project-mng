import { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { SessionManager } from "../../auth/sessions.js";

export type WsLogsDeps = { sessions: SessionManager; redis: Redis };

export function registerWsLogs(app: FastifyInstance, deps: WsLogsDeps) {
  app.get<{ Params: { id: string } }>(
    "/api/deployments/:id/logs/ws",
    { websocket: true },
    async (socket, req) => {
      const sid = req.cookies?.pm_session;
      if (!sid || !(await deps.sessions.lookup(sid))) {
        socket.close(4401, "unauthorized");
        return;
      }
      const id = req.params.id;
      const sub = deps.redis.duplicate();
      await sub.subscribe(`deploy:${id}:log`);
      sub.on("message", (_ch, msg) => {
        try { socket.send(msg); } catch { /* socket closed */ }
      });
      socket.on("close", async () => {
        try { await sub.unsubscribe(); } catch { /* ignore */ }
        try { await sub.quit(); } catch { /* ignore */ }
      });
    },
  );
}
