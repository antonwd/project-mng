"use server";
import { serverCookieHeader } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

export type AuditEvent = {
  id: string;
  ts: string;
  actorUserId: string | null;
  actorIp: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
};

export type AuditFilters = {
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function listAuditEvents(f: AuditFilters): Promise<AuditEvent[]> {
  const cookie = await serverCookieHeader();
  const qs = new URLSearchParams();
  if (f.action) qs.set("action", f.action);
  if (f.actorUserId) qs.set("actorUserId", f.actorUserId);
  if (f.from) qs.set("from", f.from);
  if (f.to) qs.set("to", f.to);
  if (f.limit) qs.set("limit", String(f.limit));
  if (f.offset) qs.set("offset", String(f.offset));
  const res = await apiFetch<{ events: AuditEvent[] }>(`/api/audit-log${qs.size ? `?${qs}` : ""}`, { cookie });
  return res.events;
}
