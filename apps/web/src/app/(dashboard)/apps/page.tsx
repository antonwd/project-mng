import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listApps } from "@/actions/apps";
import { formatDistanceToNow } from "date-fns";
import { StatusDot } from "@/components/common/status-dot";
import { EmptyState } from "@/components/common/states";
import { statusToDot } from "@/lib/status";
import { Boxes } from "lucide-react";
import { RecentActivityBanner } from "@/components/dashboard/recent-activity";

export default async function AppsPage() {
  const apps = await listApps();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Apps</h1>
        <Link href="/apps/new"><Button>New app</Button></Link>
      </div>
      <RecentActivityBanner />
      {apps.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No apps yet"
          action={<Link href="/apps/new"><Button>Create your first app</Button></Link>}
        >
          Connect a GitHub repo to deploy your first app.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {apps.map((a) => {
            const dot = statusToDot(a.lastDeploy?.status);
            return (
              <Link href={`/apps/${a.slug}`} key={a.id}>
                <Card className="px-4 py-3 hover:bg-muted/30 transition-colors flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{a.slug}</div>
                    <div className="text-sm text-muted-foreground truncate">{a.githubRepoFullName}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {a.lastDeploy && (
                      <div className="flex items-center gap-2">
                        <StatusDot status={dot} label={a.lastDeploy.status} />
                        <span>{a.lastDeploy.status}</span>
                        {a.lastDeploy.finishedAt && (
                          <span className="text-xs">
                            · {formatDistanceToNow(new Date(a.lastDeploy.finishedAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    )}
                    {typeof a.domainCount === "number" && a.domainCount > 0 && (
                      <span>{a.domainCount} domain{a.domainCount === 1 ? "" : "s"}</span>
                    )}
                    <span className="font-mono text-xs">:{a.internalPort}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
