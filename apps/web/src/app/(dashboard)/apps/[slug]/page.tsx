import { notFound } from "next/navigation";
import { getApp } from "@/actions/apps";
import { listDeployments } from "@/actions/deployments";
import { listDomains } from "@/actions/domains";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeployButton } from "@/components/apps/deploy-button";
import { formatDistanceToNow } from "date-fns";
import { StatusDot, type DotStatus } from "@/components/common/status-dot";
import { CopyButton } from "@/components/common/copy-button";
import { HelpHint } from "@/components/common/help-hint";

type Params = Promise<{ slug: string }>;

function statusToDot(status: string | undefined): DotStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "running" || status === "deploying" || status === "queued") return status;
  return "stopped";
}

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
      <Card className="px-4 py-4 gap-3">
        <div className="text-sm font-medium">Latest deployment</div>
        {lastDeploy ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusDot status={statusToDot(lastDeploy.status)} label={lastDeploy.status} />
              <span>{lastDeploy.status}</span>
              <CopyButton value={lastDeploy.commitSha} label="commit SHA" />
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

      <Card className="px-4 py-4 gap-3">
        <div className="text-sm font-medium">Container</div>
        <div className="space-y-2 text-sm">
          {lastSucceeded?.imageTag ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Image tag</div>
              <CopyButton value={lastSucceeded.imageTag} label="image tag" variant="block" />
            </div>
          ) : (
            <div className="text-muted-foreground">No running container yet.</div>
          )}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              Bound port
              <HelpHint>
                The internal port the container listens on. nginx routes the public domain to this port on the host.
              </HelpHint>
            </div>
            <CopyButton value={String(app.internalPort)} label="port" />
          </div>
          <div className="text-muted-foreground">Resources: {app.memLimitMb}MB / {app.cpuLimit} CPU</div>
        </div>
      </Card>

      <Card className="px-4 py-4 gap-3 md:col-span-2">
        <div className="text-sm font-medium">Domains</div>
        {domains.length === 0 ? (
          <div className="text-sm text-muted-foreground">No domains attached.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <Badge
                key={d.id}
                variant={d.certStatus === "active" ? "default" : d.certStatus === "failed" ? "destructive" : "secondary"}
                className="max-w-full truncate"
              >
                {d.hostname} · {d.certStatus}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
