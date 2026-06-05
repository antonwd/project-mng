import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DeploymentLogs } from "@/components/apps/deployment-logs";
import { getDeployment } from "@/actions/deployments";
import { StatusDot } from "@/components/common/status-dot";
import { CopyButton } from "@/components/common/copy-button";
import { statusToDot } from "@/lib/status";

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
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot status={statusToDot(d.status)} label={d.status} />
        <span className="text-sm">{d.status}</span>
        <CopyButton value={d.commitSha} label="commit SHA" />
        {d.commitAuthor && <span className="text-sm text-muted-foreground">by {d.commitAuthor}</span>}
      </div>
      {d.commitMessage && (
        <Card className="p-3 text-sm whitespace-pre-wrap break-words">{d.commitMessage}</Card>
      )}
      {d.errorSummary && (
        <Card className="p-3 text-sm border-destructive/40 bg-destructive/5 space-y-1">
          <div className="font-medium text-destructive">Failure</div>
          <div className="text-xs whitespace-pre-wrap break-words">{d.errorSummary}</div>
        </Card>
      )}
      <DeploymentLogs deploymentId={d.id} initialLines={initialLines} status={d.status} />
    </div>
  );
}
