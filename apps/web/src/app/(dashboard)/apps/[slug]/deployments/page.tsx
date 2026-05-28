import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DeployButton } from "@/components/apps/deploy-button";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { formatDistanceToNow } from "date-fns";

type Params = Promise<{ slug: string }>;

export default async function DeploymentsPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const deployments = await listDeployments(app.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Deployments</h2>
        <DeployButton appId={app.id} />
      </div>
      {deployments.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No deployments yet.</Card>
      ) : (
        <div className="grid gap-2">
          {deployments.map((d) => {
            const duration = d.finishedAt && d.startedAt
              ? `${Math.round((new Date(d.finishedAt).getTime() - new Date(d.startedAt).getTime()) / 1000)}s`
              : null;
            return (
              <Link key={d.id} href={`/apps/${app.slug}/deployments/${d.id}`}>
                <Card className="p-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant={d.status === "succeeded" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>
                      {d.status}
                    </Badge>
                    <div className="min-w-0">
                      <div className="font-mono text-xs truncate">{d.commitSha.slice(0, 8)}</div>
                      {d.commitMessage && (
                        <div className="text-sm truncate text-muted-foreground">{d.commitMessage.split("\n")[0]}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right space-y-0.5 shrink-0">
                    <div>{d.trigger}</div>
                    {duration && <div>{duration}</div>}
                    <div>{formatDistanceToNow(new Date(d.queuedAt), { addSuffix: true })}</div>
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
