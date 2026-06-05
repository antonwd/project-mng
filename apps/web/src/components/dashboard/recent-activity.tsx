import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listAuditEvents } from "@/actions/audit";
import { formatDistanceToNow } from "date-fns";

const INTERESTING_ACTIONS = new Set([
  "app.create",
  "app.delete",
  "deploy.enqueue",
  "deploy.redeploy",
  "deploy.rollback",
  "domain.add",
  "domain.remove",
  "invite.create",
  "user.delete",
  "credential.remove",
]);

function targetHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetType || !targetId) return null;
  if (targetType === "app") return `/apps/${targetId}`;
  if (targetType === "user") return `/users`;
  if (targetType === "domain") return null; // domain detail isn't a route; link to /apps instead
  return null;
}

function actionLabel(action: string): string {
  // Render the action as a short human-readable phrase.
  const map: Record<string, string> = {
    "app.create": "created app",
    "app.delete": "deleted app",
    "deploy.enqueue": "queued deploy",
    "deploy.redeploy": "redeployed",
    "deploy.rollback": "rolled back",
    "domain.add": "attached domain",
    "domain.remove": "removed domain",
    "invite.create": "created invite",
    "user.delete": "deleted user",
    "credential.remove": "removed credential",
  };
  return map[action] ?? action;
}

export async function RecentActivityBanner() {
  const all = await listAuditEvents({ limit: 30 }).catch(() => []);
  const events = all.filter((e) => INTERESTING_ACTIONS.has(e.action)).slice(0, 8);
  if (events.length === 0) return null;

  return (
    <>
      {/* Mobile: collapsed single-line summary */}
      <Card className="md:hidden px-3 py-2 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground truncate">
          {events.length} recent event{events.length === 1 ? "" : "s"} · last {formatDistanceToNow(new Date(events[0].ts), { addSuffix: true })}
        </span>
        <Link href="/audit" className="text-xs underline shrink-0">View all</Link>
      </Card>

      {/* Desktop: full banner */}
      <Card className="hidden md:block">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
          <div className="text-sm font-medium">Recent activity</div>
          <Link href="/audit" className="text-xs underline text-muted-foreground">View all</Link>
        </div>
        <ul className="divide-y">
          {events.map((e) => {
            const href = targetHref(e.targetType, e.targetId);
            const row = (
              <div className="flex items-center gap-3 px-4 py-2 text-sm">
                <Badge variant="secondary" className="font-mono text-xs">{e.action}</Badge>
                <span className="truncate flex-1 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground">{e.actorUserId?.slice(0, 8) ?? "system"}</span>
                  {" "}{actionLabel(e.action)}
                  {e.targetId && <span className="text-muted-foreground"> · {e.targetType}:{e.targetId.slice(0, 8)}</span>}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(e.ts), { addSuffix: true })}
                </span>
              </div>
            );
            return (
              <li key={e.id}>
                {href ? <Link href={href} className="block hover:bg-muted/30">{row}</Link> : row}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
