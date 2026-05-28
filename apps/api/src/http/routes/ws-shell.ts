import { FastifyInstance } from "fastify";
import { SessionManager } from "../../auth/sessions.js";
import { DockerClient } from "../../clients/docker.js";
import type { Database } from "../../db/client.js";
import { AuditLog } from "../../auth/audit.js";
import { apps } from "../../db/schema.js";
import { eq, and, isNull } from "drizzle-orm";

export type WsShellDeps = {
  sessions: SessionManager;
  docker: DockerClient;
  db: Database;
  audit: AuditLog;
};

export function registerWsShell(app: FastifyInstance, deps: WsShellDeps) {
  app.get<{ Params: { id: string } }>(
    "/api/apps/:id/shell",
    { websocket: true },
    async (socket, req) => {
      const sid = req.cookies?.pm_session;
      const session = sid ? await deps.sessions.lookup(sid) : null;
      if (!session) {
        socket.close(4401, "unauthorized");
        return;
      }
      const appId = req.params.id;
      const [appRow] = await deps.db.select().from(apps).where(and(eq(apps.id, appId), isNull(apps.deletedAt)));
      if (!appRow) {
        socket.close(4404, "app not found");
        return;
      }

      const running = await deps.docker.listContainersByLabel("pm.app", appRow.id);
      const target = running.find((c: { State?: string }) => c.State === "running") ?? running[0];
      if (!target) {
        socket.close(4404, "no running container");
        return;
      }

      const container = deps.docker.getContainer(target.Id);
      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ["/bin/sh"],
      });
      const stream = await exec.start({ hijack: true, stdin: true });

      await deps.audit.write({
        actorIp: req.ip,
        actorUserId: session.userId,
        action: "shell.open",
        targetType: "app",
        targetId: appRow.id,
      });

      stream.on("data", (chunk: Buffer) => {
        try { socket.send(chunk); } catch { /* socket closed */ }
      });

      socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const buf = data instanceof ArrayBuffer ? Buffer.from(data) : Array.isArray(data) ? Buffer.concat(data) : data;
          stream.write(buf);
        } catch { /* stream closed */ }
      });

      const cleanup = async () => {
        try { stream.end(); } catch { /* ignore */ }
        await deps.audit.write({
          actorIp: req.ip,
          actorUserId: session.userId,
          action: "shell.close",
          targetType: "app",
          targetId: appRow.id,
        }).catch(() => undefined);
      };
      socket.on("close", cleanup);
      stream.on("end", () => {
        try { socket.close(1000, "shell ended"); } catch { /* ignore */ }
      });
    },
  );
}
