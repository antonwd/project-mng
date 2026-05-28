import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listApps } from "@/actions/apps";
import { formatDistanceToNow } from "date-fns";

export default async function AppsPage() {
  const apps = await listApps();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Apps</h1>
        <Link href="/apps/new"><Button>New app</Button></Link>
      </div>
      {apps.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <p className="mb-4">No apps yet.</p>
          <Link href="/apps/new"><Button>Create your first app</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {apps.map((a) => (
            <Link href={`/apps/${a.slug}`} key={a.id}>
              <Card className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.slug}</div>
                  <div className="text-sm text-muted-foreground">{a.githubRepoFullName}</div>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {a.lastDeploy && (
                    <>
                      <Badge variant={a.lastDeploy.status === "succeeded" ? "default" : a.lastDeploy.status === "failed" ? "destructive" : "secondary"}>
                        {a.lastDeploy.status}
                      </Badge>
                      {a.lastDeploy.finishedAt && (
                        <span>{formatDistanceToNow(new Date(a.lastDeploy.finishedAt), { addSuffix: true })}</span>
                      )}
                    </>
                  )}
                  {typeof a.domainCount === "number" && a.domainCount > 0 && (
                    <span>{a.domainCount} domain{a.domainCount === 1 ? "" : "s"}</span>
                  )}
                  <span className="font-mono text-xs">:{a.internalPort}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
