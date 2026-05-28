import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DeploymentLogs } from "@/components/apps/deployment-logs";
import { getDeployment } from "@/actions/deployments";

type Params = Promise<{ slug: string; id: string }>;

export default async function DeploymentDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  let data;
  try {
    data = await getDeployment(id);
  } catch {
    notFound();
  }
  const { deployment: d, logs } = data;
  const initialLines = logs.map((l) => `[${l.stream}] ${l.line}`);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={d.status === "succeeded" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>
          {d.status}
        </Badge>
        <span className="font-mono text-xs">{d.commitSha.slice(0, 12)}</span>
        {d.commitAuthor && <span className="text-sm text-muted-foreground">by {d.commitAuthor}</span>}
      </div>
      {d.commitMessage && (
        <Card className="p-3 text-sm whitespace-pre-wrap">{d.commitMessage}</Card>
      )}
      {d.errorSummary && (
        <Card className="p-3 text-sm border-destructive/40 bg-destructive/5">
          <div className="font-medium text-destructive">Failure</div>
          <div className="text-xs whitespace-pre-wrap">{d.errorSummary}</div>
        </Card>
      )}
      <DeploymentLogs deploymentId={d.id} initialLines={initialLines} status={d.status} />
    </div>
  );
}
