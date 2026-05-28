import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { listDomains } from "@/actions/domains";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeployButton } from "@/components/apps/deploy-button";
import { formatDistanceToNow } from "date-fns";

type Params = Promise<{ slug: string }>;

export default async function AppOverviewPage({ params }: { params: Params }) {
  const { slug } = await params;
  const app = await getApp(slug);
  if (!app) notFound();
  const [deployments, domains] = await Promise.all([
    listDeployments(app.id).catch(() => []),
    listDomains(app.id).catch(() => []),
  ]);
  const lastSucceeded = deployments.find((d) => d.status === "succeeded");
  const lastDeploy = deployments[0];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Latest deployment</div>
        {lastDeploy ? (
          <div className="space-y-1 text-sm">
            <div>
              <Badge variant={lastDeploy.status === "succeeded" ? "default" : lastDeploy.status === "failed" ? "destructive" : "secondary"}>
                {lastDeploy.status}
              </Badge>{" "}
              <span className="font-mono text-xs">{lastDeploy.commitSha.slice(0, 8)}</span>
            </div>
            {lastDeploy.commitAuthor && <div className="text-muted-foreground">by {lastDeploy.commitAuthor}</div>}
            {lastDeploy.finishedAt && (
              <div className="text-muted-foreground">{formatDistanceToNow(new Date(lastDeploy.finishedAt), { addSuffix: true })}</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No deployments yet.</div>
        )}
        <DeployButton appId={app.id} />
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Container</div>
        <div className="text-sm space-y-1">
          {lastSucceeded?.imageTag ? (
            <div className="font-mono text-xs break-all">{lastSucceeded.imageTag}</div>
          ) : (
            <div className="text-muted-foreground">No running container yet.</div>
          )}
          <div className="text-muted-foreground">Bound port: <span className="font-mono">:{app.internalPort}</span></div>
          <div className="text-muted-foreground">Resources: {app.memLimitMb}MB / {app.cpuLimit} CPU</div>
        </div>
      </Card>

      <Card className="p-4 space-y-2 md:col-span-2">
        <div className="text-sm font-medium">Domains</div>
        {domains.length === 0 ? (
          <div className="text-sm text-muted-foreground">No domains attached.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <Badge key={d.id} variant={d.certStatus === "active" ? "default" : d.certStatus === "failed" ? "destructive" : "secondary"}>
                {d.hostname} · {d.certStatus}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
