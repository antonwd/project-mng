import { listAuditEvents } from "@/actions/audit";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { ScrollText } from "lucide-react";
import { format } from "date-fns";

type Search = Promise<{ action?: string; actorUserId?: string; from?: string; to?: string; offset?: string }>;

export default async function AuditPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const offset = sp.offset ? Number(sp.offset) : 0;
  const events = await listAuditEvents({
    action: sp.action,
    actorUserId: sp.actorUserId,
    from: sp.from,
    to: sp.to,
    offset,
    limit: 100,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" method="get">
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="action">Action prefix</label>
          <input id="action" name="action" defaultValue={sp.action ?? ""} className="block w-full rounded-md border px-2 py-1 text-sm" placeholder="login." />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="actorUserId">Actor (UUID)</label>
          <input id="actorUserId" name="actorUserId" defaultValue={sp.actorUserId ?? ""} className="block w-full rounded-md border px-2 py-1 text-sm" />
        </div>
        <button className="rounded-md border px-3 py-1 text-sm">Filter</button>
      </form>
      {events.length === 0 ? (
        <EmptyState icon={ScrollText} title="No events match">
          Adjust the filter above or clear it to see all events.
        </EmptyState>
      ) : (
        <Card className="divide-y">
          {events.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 sm:grid sm:grid-cols-[140px_1fr] sm:gap-3 p-3 text-sm">
              <div className="text-xs text-muted-foreground font-mono">{format(new Date(e.ts), "yyyy-MM-dd HH:mm:ss")}</div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{e.action}</Badge>
                  {e.targetType && <span className="text-xs text-muted-foreground">{e.targetType}:{e.targetId?.slice(0, 8)}</span>}
                  {e.actorIp && <span className="text-xs text-muted-foreground font-mono">{e.actorIp}</span>}
                </div>
                {Object.keys(e.metadata ?? {}).length > 0 && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{JSON.stringify(e.metadata, null, 0)}</pre>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
