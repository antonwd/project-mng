import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, lte, like, SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { auditLog } from "../../db/schema.js";

export type AuditRoutesDeps = { db: Database };

const Query = z.object({
  action: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps) {
  app.get<{ Querystring: Record<string, string> }>(
    "/api/audit-log",
    { preHandler: app.requireAuth },
    async (req) => {
      const q = Query.parse(req.query);
      const conds: SQL[] = [];
      if (q.action) conds.push(like(auditLog.action, `${q.action}%`));
      if (q.actorUserId) conds.push(eq(auditLog.actorUserId, q.actorUserId));
      if (q.from) conds.push(gte(auditLog.ts, new Date(q.from)));
      if (q.to) conds.push(lte(auditLog.ts, new Date(q.to)));
      const where = conds.length > 0 ? and(...conds) : undefined;
      const rows = await deps.db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.ts))
        .limit(q.limit)
        .offset(q.offset);
      return { events: rows };
    },
  );
}
