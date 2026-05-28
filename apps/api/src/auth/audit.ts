import type { Database } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export type AuditEvent = {
  actorUserId?: string | null;
  actorIp?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export class AuditLog {
  constructor(private db: Database) {}
  async write(e: AuditEvent): Promise<void> {
    await this.db.insert(auditLog).values({
      actorUserId: e.actorUserId ?? null,
      actorIp: e.actorIp ?? null,
      action: e.action,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      metadata: e.metadata ?? {},
    });
  }
}
