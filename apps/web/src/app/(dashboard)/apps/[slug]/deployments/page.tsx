import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DeployButton } from "@/components/apps/deploy-button";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { formatDistanceToNow } from "date-fns";
import { StatusDot } from "@/components/common/status-dot";
import { EmptyState } from "@/components/common/states";
import { statusToDot } from "@/lib/status";
import { History } from "lucide-react";

type Params = Promise<{ slug: string }>;

export default async function DeploymentsPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const deployments = await listDeployments(app.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Deployments</h2>
        <DeployButton appId={app.id} />
      </div>
      {deployments.length === 0 ? (
        <EmptyState icon={History} title="No deployments yet">
          Push to <code className="font-mono">{app.defaultBranch}</code> or click <strong>Deploy latest</strong> above.
        </EmptyState>
      ) : (
        <div className="grid gap-2">
          {deployments.map((d) => {
            const duration = d.finishedAt && d.startedAt
              ? `${Math.round((new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime()) / 1000)}s`
              : null;
            return (
              <Link key={d.id} href={`/apps/${app.slug}/deployments/${d.id}`}>
                <Card className="p-3 hover:bg-muted/30 transition-colors flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <StatusDot status={statusToDot(d.status)} label={d.status} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        <span className="font-mono text-xs">{d.commitSha.slice(0, 8)}</span>
                        <span className="ml-2 text-muted-foreground">· {d.status}</span>
                      </div>
                      {d.commitMessage && (
                        <div className="text-sm truncate text-muted-foreground">{d.commitMessage.split("\n")[0]}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground shrink-0 sm:text-right sm:flex-col sm:items-end">
                    <span>{d.trigger}</span>
                    {duration && <span>{duration}</span>}
                    <span>{formatDistanceToNow(new Date(d.queuedAt), { addSuffix: true })}</span>
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
